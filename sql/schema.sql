CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DROP TABLE IF EXISTS answers; 
DROP TABLE IF EXISTS questions; 


CREATE TABLE public.questions (
  uuid UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  question TEXT NOT NULL,
  choice_a TEXT NOT NULL,
  choice_b TEXT NOT NULL,
  choice_c TEXT NOT NULL,
  choice_d TEXT NOT NULL,
  right_answer CHAR(1) NOT NULL
);

CREATE TABLE answers (
  uuid UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  question_uuid UUID NOT NULL,
  selection CHAR(1) NOT NULL,
  is_correct BOOLEAN NOT NULL,
  created_at TIMESTAMP default current_timestamp NOT NULL
);
