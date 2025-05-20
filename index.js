require('dotenv').config();
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const app = express();
const pg = require('pg');
const { Client } = pg;
const PORT = process.env.PORT || 3000;

const client = new Client({
    connectionString: process.env.DATABASE_URL,
})
client.connect()
    .then(() => console.log('Connected to PostgreSQL'))
    .catch(err => console.error('Error connecting to PostgreSQL', err));

client.query(`CREATE DATABASE questionnaire;`)
    .then(() => console.log('Database created successfully'))
    .catch(err => {
        if (err.code === '42P04') {
            console.log('Database already exists');
        } else {
            console.error('Error creating database', err);
        }
    })
    .then(() => {
        const sqlFilePath = path.join(__dirname, 'sql/schema.sql');
        return fs.readFile(sqlFilePath, 'utf8');
    })
    .then(sqlCommnads => client.query(sqlCommnads))
    .then(() => console.log('Created database schema'))
    .then(() => {
        const sqlFeedFilePath = path.join(__dirname, 'sql/seed.sql');
        return fs.readFile(sqlFeedFilePath, 'utf8');
    })
    .then(sqlInsertCommnads => client.query(sqlInsertCommnads))
    .then(() => console.log('Inserted data into database'))
    .catch(err => console.error('Error creating database', err));

app.use(express.json());
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');

    next();
});

app.get('/questions', async (req, res) => {
    try {
        const response = await client.query(`
            SELECT 
            (SELECT count(true) FROM answers WHERE is_correct IS TRUE) as score,
            (SELECT count(true) FROM answers) as answers_total,
            (
                SELECT
                questions.uuid
                FROM questions
                WHERE
                questions.uuid NOT IN (
                    SELECT question_uuid FROM answers
                )
                LIMIT 1
            ) as question_index,
            (SELECT COALESCE(array_to_json(array_agg(row_to_json(array_row))),'[]'::json) FROM (
                SELECT
                questions.uuid,
                questions.question,
                questions.choice_a,
                questions.choice_b,
                questions.choice_c,
                questions.choice_d
                FROM questions
            ) array_row) as questions;
        `);
        res.status(200).json(response.rows[0]);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/clear', async (req, res) => {
    try {
        await client.query(`TRUNCATE answers;`);

        const response = await client.query(`
        SELECT 
        (SELECT count(true) FROM answers WHERE is_correct IS TRUE) as score,
        (SELECT count(true) FROM answers) as answers_total,
        (
            SELECT
            questions.uuid
            FROM questions
            WHERE
            questions.uuid NOT IN (
                SELECT question_uuid FROM answers
            )
            LIMIT 1
        ) as question_index`
        );
        res.status(200).json(response.rows[0]);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Error resetting questions' });
    }
});

app.post('/submit', async (req, res) => {
    const question_uuid = req.body.question_uuid;
    const selection = req.body.selection;
    console.log('question id:', question_uuid);
    console.log('selection', selection);    

    const data = await client.query(
        `SELECT right_answer FROM questions WHERE uuid = $1`,
        [question_uuid]
    );

    const is_correct = (data.rows[0].right_answer === selection);
    console.log('is_correct',data.rows[0], selection, is_correct);
    try {
        await client.query(
            'INSERT INTO answers (question_uuid, selection, is_correct) VALUES ($1, $2, $3)',
            [question_uuid, selection, is_correct]
        );

        const response = await client.query(`
            SELECT 
            (SELECT count(true) FROM answers WHERE is_correct IS TRUE) as score,
            (SELECT count(true) FROM answers) as answers_total,
            (
                SELECT
                questions.uuid
                FROM questions
                WHERE
                questions.uuid NOT IN (
                    SELECT question_uuid FROM answers
                )
                LIMIT 1
            ) as question_index;`
        );

        res.status(200).json(response.rows[0]);
    } catch (error) {
        console.error('Failed to record answer:', error);
        res.status(500).json({ error: 'Failed to record answer' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});