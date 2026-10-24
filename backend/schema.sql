PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, login TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('student','professor')), password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS subjects (id TEXT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS classes (id TEXT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS enrollments (
  student_id TEXT REFERENCES users(id), subject_id TEXT REFERENCES subjects(id),
  class_id TEXT REFERENCES classes(id), PRIMARY KEY(student_id,subject_id)
);
CREATE TABLE IF NOT EXISTS assignments (
  professor_id TEXT REFERENCES users(id), subject_id TEXT REFERENCES subjects(id),
  class_id TEXT REFERENCES classes(id), PRIMARY KEY(professor_id,subject_id,class_id)
);
CREATE TABLE IF NOT EXISTS grades (
  student_id TEXT REFERENCES users(id), subject_id TEXT REFERENCES subjects(id),
  assessment TEXT CHECK(assessment IN ('p1','p2','trabalho')),
  concept TEXT NOT NULL CHECK(concept IN ('A','PA','NA')),
  updated_by TEXT REFERENCES users(id), updated_at TEXT NOT NULL,
  PRIMARY KEY(student_id,subject_id,assessment)
);
CREATE TABLE IF NOT EXISTS attendance (
  student_id TEXT REFERENCES users(id), subject_id TEXT REFERENCES subjects(id),
  lesson_date TEXT NOT NULL, present INTEGER NOT NULL CHECK(present IN (0,1)),
  updated_by TEXT REFERENCES users(id), PRIMARY KEY(student_id,subject_id,lesson_date)
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY, professor_id TEXT NOT NULL REFERENCES users(id),
  subject_id TEXT NOT NULL REFERENCES subjects(id), class_id TEXT NOT NULL REFERENCES classes(id),
  title TEXT NOT NULL, type TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL,
  location TEXT NOT NULL, description TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES users(id),
  subject_id TEXT REFERENCES subjects(id), type TEXT NOT NULL, message TEXT NOT NULL,
  anonymous INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pendente',
  response TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, company TEXT NOT NULL, mode TEXT NOT NULL,
  type TEXT NOT NULL, area TEXT NOT NULL, salary TEXT NOT NULL,
  description TEXT NOT NULL, requirements TEXT NOT NULL, benefits TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS applications (
  student_id TEXT REFERENCES users(id), job_id TEXT REFERENCES jobs(id), created_at TEXT NOT NULL,
  PRIMARY KEY(student_id,job_id)
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY, professor_id TEXT NOT NULL REFERENCES users(id),
  class_id TEXT NOT NULL REFERENCES classes(id), job_id TEXT NOT NULL REFERENCES jobs(id),
  message TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notification_recipients (
  notification_id TEXT REFERENCES notifications(id), student_id TEXT REFERENCES users(id),
  PRIMARY KEY(notification_id,student_id)
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS recovery_requests (
  id TEXT PRIMARY KEY, login TEXT NOT NULL, created_at TEXT NOT NULL
);
