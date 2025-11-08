# Notes App

This Demonstrator shows the usage of RAG in a notes app. After installation, the user is able to write down notes, which are saved in a local DB. When saved, these notes are run through an embedding model, which creates a vector, which is also stored on the SQLite DB. Upon querying with natural language, the request is sent to the backend, which calls the DB and performs a cosine similarity search over the vectors in the DB.

# Tech Stack
Frontend: React, Tailwind
Backend: SQLite, Rust-Tauri, Ollama

# Installation
Clone the folder and execute npm install. Then run with npm run tauri dev. Make sure ollama is installed and configure the code in src-tauri/src/lib.rs to use the model on your machine. 
