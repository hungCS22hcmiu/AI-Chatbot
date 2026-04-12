// Set required environment variables before any module is loaded.
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'test';
process.env.JWT_SECRET = 'test-secret-minimum-32-chars-for-jest-tests';
process.env.NODE_ENV = 'test';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.OPENROUTER_API_KEY = 'test-key';
process.env.GROQ_API_KEY = 'test-key';
process.env.GEMINI_API_KEY = 'test-key';
process.env.LOCAL_MODEL_URL = 'http://localhost:8000';
