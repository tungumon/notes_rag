
use core::fmt;
use std::fmt::Display;

use ollama_rs::Ollama;
use ollama_rs::generation::completion::request::GenerationRequest;
use ollama_rs::generation::embeddings::request::GenerateEmbeddingsRequest;
use tauri::{Manager, async_runtime::spawn_blocking};
use rusqlite::{params, Connection, Result};
use serde_json;
use serde::{Serialize, Deserialize};

use tauri::AppHandle;


// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    let scal_prod: f32 = a.iter().zip(b).map(|(x, y)| x * y).sum();
    let norm_a = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    scal_prod / (norm_a * norm_b)
}

fn embedding_to_json(embedding: &Vec<f32>) -> String {
    serde_json::to_string(embedding).unwrap()
}

fn json_to_embedding(json: &str) -> Option<Vec<f32>> {
    serde_json::from_str(json).ok()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Note {
    id: i64,
    title: String,
    content: String,
}

fn init_db(app_handle: &AppHandle){

    let conn = Connection::open(get_db_path(app_handle)).expect("Could not connect to db");
    conn.execute(
        "CREATE TABLE IF NOT EXISTS embeddings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            embedding_json TEXT NOT NULL
        )",
        [],
    ).expect("Could not execute table creation");
}

fn get_db_path(app_handle: &AppHandle) -> String {
    let mut path = app_handle.path().app_data_dir().expect("Could not find path");

    std::fs::create_dir_all(&path).expect("Failed to create app data directory");
    path.push("db.db");
    path.to_str().expect("Could not convert to string").to_string()

}

#[tauri::command]
fn deletenote(app_handle: AppHandle, id: i64) -> Result<(), String> {
    let conn = Connection::open(get_db_path(&app_handle)).expect("Could not connect to db");
    
    conn.execute(
        "DELETE FROM embeddings WHERE id = ?1",
        [&id.to_string()],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}
//
#[tauri::command]
async fn embedandsave(app_handle: AppHandle, title: String, note: String, all: String) -> Result<Note, String>{
    let request = GenerateEmbeddingsRequest::new("nomic-embed-text:latest".to_string(), all.into());
    let ollama = Ollama::default();
    let res = ollama.generate_embeddings(request).await.unwrap().embeddings[0].clone();

    let db_path= get_db_path(&app_handle);
    //print!("{}", db_path);
    let conn = Connection::open(db_path).expect("Could not connect to db");

    let embedding_json = serde_json::to_string(&res).unwrap();

    conn.execute("INSERT INTO embeddings(title, content, embedding_json) VALUES (?1, ?2, ?3)", params![title, note, embedding_json]).unwrap();

    let id = conn.last_insert_rowid();

    Ok(Note{
        id,
        title,
        content: note
    })
}

struct NoteWithEmbeddings{
    id: i64,
    title: String,
    content: String,
    embedding: Vec<f32>
}

impl Display for NoteWithEmbeddings{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> fmt::Result{
        write!(f, "Title: {} \n\n Content: {}", self.title, self.content)
    }
}

#[tauri::command]
async fn getallnotes(app_handle: AppHandle) -> Result<Vec<Note>, String>{
    let conn = Connection::open(get_db_path(&app_handle)).expect("Could not connect to db");

    let mut stmt = conn.prepare("SELECT id, title, content FROM embeddings").map_err(|e| e.to_string())?;
    let notes_iter = stmt.query_map([], |row|{
        Ok(Note{
            id: row.get(0).unwrap(),
            title: row.get(1).unwrap(),
            content: row.get(2).unwrap(),
        })
    }).map_err(|e| e.to_string())?;

    let mut notes = vec![];
    for note in notes_iter{
        notes.push(note.map_err(|e| e.to_string())?);
    }

    Ok(notes)
}

async fn get_all_entries(app_handle: &AppHandle) -> Result<Vec<NoteWithEmbeddings>, String>{
    let conn = Connection::open(get_db_path(app_handle)).expect("Could not connect to db");
    let mut stmt = conn.prepare("SELECT id, title, content, embedding_json FROM embeddings").map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row|{
            let embedding_json: Option<String> = row.get(3).ok();
            let embedding = embedding_json.and_then(|json| json_to_embedding(&json)).expect("Error Deserializing Embedding");
            
            Ok(NoteWithEmbeddings{
                id: row.get(0)?,
                title: row.get(1)?,
                content: row.get(2)?,
                embedding: embedding
            })
        }).map_err(|e|e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    
    Ok(rows)
}



#[tauri::command]
async fn llm_req(app_handle: AppHandle, question: String, notes_context: String) -> Result<String, String>{
    let system_prompt: String = format!(
        "You are an expert at reading comprehension.
        Only answer the question and ignore all information unrelated to the question.
        Answer short and concisely, skipping over unecessary information.
        However, be aware that the information could be in multiple notes.
        Put in all information you can find in the notes. Use cold and professional tone.
        If the information is not present in the context, say 'There is no information on this in the notes'.
        Using the following context, answer the question.");

    //Embed the query
    let request = GenerateEmbeddingsRequest::new("nomic-embed-text:latest".to_string(), question.clone().into());
    let ollama = Ollama::default();
    let q_embed = ollama.generate_embeddings(request).await.unwrap().embeddings[0].clone();
    
   

    let mut all_entries = get_all_entries(&app_handle).await?;
   
    all_entries.sort_by(|entry1, entry2| {
        let a = cosine_similarity(&entry1.embedding, &q_embed);
        let b = cosine_similarity(&entry2.embedding, &q_embed);
        if a < b{
            return std::cmp::Ordering::Less;
        }
        else if a == b{
            return std::cmp::Ordering::Equal;
        }
        else{
            return std::cmp::Ordering::Greater;
        }
        
    });

     let all_cosines: Vec<_> = all_entries.iter().map(|entry| cosine_similarity(&entry.embedding, &q_embed)).collect();

     let mut all_cos_string = "".to_string();
    
     for cos in all_cosines{
        all_cos_string = format!("{} {}", all_cos_string, cos);
     }



    let mut context_string = "".to_string();
    //Take Maximum 3 Elemnts
    for entry in all_entries.iter().take(10){
        context_string = format!("{}{}\n", context_string, entry);
    }

    let prompt: String = format!("{} \n\n Context:\n {} \n\n\n Question:\n {}", system_prompt, context_string, question);

    let ollama = Ollama::default();
    let model = "llama3.2:3b".to_string();

    let res = ollama.generate(GenerationRequest::new(model, prompt.clone())).await;

    if let Ok(res) = res{
        Ok(res.response)
        //Ok(format!("{} {} ",context_string, all_cos_string))
    }
    else{
        Err(format!("Error Generating Answer"))
    }

    
   // Ok(format!("Your Question was: {} and the context is {}. I am Groot! (from Rust)", question, notes_context))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app|{
            init_db(&app.handle());
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, llm_req, getallnotes, embedandsave, deletenote])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
