require('dotenv').config();
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
// const serverless = require('serverless-http');
const app = express();
const pg = require('pg');
const { Client } = pg;
const PORT = process.env.PORT || 3000;

async function initialize() {
    const initClient = new Client({
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
        ssl: { rejectUnauthorized: false }
    });
    await initClient.connect()
    .then(() => console.log('Connected to AWS RDS PostgreSQL'))
    .catch((err) => console.error('Connection error', err))
    .then(() => {
        const sqlFilePath = path.join(__dirname, 'sql/schema.sql');
        return fs.readFile(sqlFilePath, 'utf8');
    })
    .then((sqlCommands) => initClient.query(sqlCommands))
    .catch((err) => console.error('Error creating schema', err))
    .then(() => {
        const sqlFeedFilePath = path.join(__dirname, 'sql/seed.sql');
        return fs.readFile(sqlFeedFilePath, 'utf8');
    })
    .then((sqlInsertCommnads) => initClient.query(sqlInsertCommnads))
    .catch((err) => console.error('Error inserting data', err))
    .then(() => initClient.end())
    .then(() => console.log('Disconnected from AWS RDS PostgreSQL'));
}

initialize();

app.use(express.json({ strict: false }));
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');

    next();
});

app.get('/questions', async (req, res) => {
    try {
        const client = new Client({
            user: process.env.DB_USER,
            host: process.env.DB_HOST,
            database: process.env.DB_NAME,
            password: process.env.DB_PASSWORD,
            port: process.env.DB_PORT,
            ssl: { rejectUnauthorized: false }
        });
        await client.connect().then(() => console.log('Connected to AWS RDS PostgreSQL'))

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
        await client.end().then(() => console.log('Disconnected from AWS RDS PostgreSQL'));
        console.log('Sent questions');
        res.status(200).json(response.rows[0]);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/clear', async (req, res) => {
    try {
        const clearClient = new Client({
            user: process.env.DB_USER,
            host: process.env.DB_HOST,
            database: process.env.DB_NAME,
            password: process.env.DB_PASSWORD,
            port: process.env.DB_PORT,
            ssl: { rejectUnauthorized: false }
        });
        await clearClient.connect().then(() => console.log('Connected to AWS RDS PostgreSQL'))
        await clearClient.query(`TRUNCATE answers;`);

        const response = await clearClient.query(`
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
        await clearClient.end().then(() => console.log('Disconnected from AWS RDS PostgreSQL'));
        console.log('Cleared questionnaire');
        res.status(200).json(response.rows[0]);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Error resetting questions' });
    }
});

app.post('/submit', async (req, res) => {
    const submitClient = new Client({
            user: process.env.DB_USER,
            host: process.env.DB_HOST,
            database: process.env.DB_NAME,
            password: process.env.DB_PASSWORD,
            port: process.env.DB_PORT,
            ssl: { rejectUnauthorized: false }
        });
    await submitClient.connect().then(() => console.log('Connected to AWS RDS PostgreSQL'));
    // const jsonBody = JSON.parse(req.apiGateway.event.body);
    // const question_uuid = jsonBody.question_uuid;
    // const selection = jsonBody.selection;
    const question_uuid = req.body.question_uuid;
    const selection = req.body.selection;
    console.log('question id:', question_uuid);
    console.log('selection', selection);    

    const data = await submitClient.query(
        `SELECT right_answer FROM questions WHERE uuid = $1`,
        [question_uuid]
    );
    const is_correct = (data.rows[0].right_answer === selection);
    console.log('is_correct',data.rows[0], selection, is_correct);
    try {
        await submitClient.query(
            'INSERT INTO answers (question_uuid, selection, is_correct) VALUES ($1, $2, $3)',
            [question_uuid, selection, is_correct]
        );

        const response = await submitClient.query(`
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
        await submitClient.end().then(() => console.log('Disconnected from AWS RDS PostgreSQL'));

        console.log('Submittedquestionnaire');
        res.status(200).json(response.rows[0]);
    } catch (error) {
        console.error('Failed to record answer:', error);
        res.status(500).json({ error: 'Failed to record answer' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// module.exports.handler = serverless(app);