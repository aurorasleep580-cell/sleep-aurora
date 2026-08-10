CREATE TABLE IF NOT EXISTS patients (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(150),
  phone VARCHAR(30),
  email VARCHAR(150),
  consent_given BOOLEAN DEFAULT FALSE,
  status VARCHAR(20) DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS screening_answers (
  id SERIAL PRIMARY KEY,
  patient_id INT UNIQUE REFERENCES patients(id) ON DELETE CASCADE,

  age INT,
  gender VARCHAR(20),
  menstrual VARCHAR(30),
  height NUMERIC(5,2),
  weight NUMERIC(5,2),
  neck_raw NUMERIC(5,2),

  medical JSONB,
  consumption JSONB,

  work VARCHAR(30),
  schedule VARCHAR(20),
  sleep_start TIME,
  wake_time TIME,
  avg_sleep NUMERIC(4,2),

  sleep_satisfaction VARCHAR(30),
  daytime_satisfaction VARCHAR(30),
  daytime_sleepy VARCHAR(10),
  sleepy_freq VARCHAR(30),

  insomnia_gate VARCHAR(10),
  sleep_latency VARCHAR(30),
  night_waking VARCHAR(10),
  difficulty_back_sleep VARCHAR(10),

  hypersomnia_gate VARCHAR(10),
  difficulty_waking VARCHAR(10),
  nap_freq VARCHAR(30),
  nap_duration VARCHAR(30),
  nap_refreshed VARCHAR(10),

  snoring_gate VARCHAR(10),
  witnessed_apnea VARCHAR(10),
  loud_snoring VARCHAR(10),
  night_awakenings VARCHAR(10),
  morning_headache VARCHAR(10),
  dry_mouth VARCHAR(10),

  circadian_gate VARCHAR(10),
  chronotype VARCHAR(30),
  brain_fog VARCHAR(10),
  weekend_shift VARCHAR(10),

  duration VARCHAR(20),

  completion_percent INT DEFAULT 0,
  last_completed_step INT DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS screening_results (
  id SERIAL PRIMARY KEY,
  patient_id INT UNIQUE REFERENCES patients(id) ON DELETE CASCADE,

  sleep_opportunity NUMERIC(4,2),

  osa_score INT,
  osa_tier VARCHAR(20),

  insomnia_score INT,
  insomnia_tier VARCHAR(20),

  hypersomnia_score INT,
  hypersomnia_tier VARCHAR(20),

  circadian_score INT,
  circadian_tier VARCHAR(20),
  circadian_subtypes JSONB,

  primary_finding_code VARCHAR(50),
  primary_finding_label VARCHAR(150),

  comorbidities JSONB,

  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);