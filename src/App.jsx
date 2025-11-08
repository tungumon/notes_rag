import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Save, X, MessageSquare, BookOpen } from 'lucide-react';
import './App.css';
import { invoke } from '@tauri-apps/api/core';

export default function NotesApp() {
  const [activeTab, setActiveTab] = useState('notes');
  const [notes, setNotes] = useState([
    { id: 1, title: 'Sample Note', content: 'This is a sample note. You can edit or delete it.' }
  ]);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotes();
  }, []);

  const loadNotes = async () => {
    try {
      setLoading(true);
      const loadedNotes = await invoke('getallnotes');
      setNotes(loadedNotes);
    } catch (error) {
      console.error('Error loading notes:', error);
      alert('Failed to load notes: ' + error);
    } finally {
      setLoading(false);
    }
  };


  const addNote = () => {
    const newNote = {
      id: Date.now(),
      title: 'New Note',
      content: 'Start writing your note here...'
    };
    setNotes([...notes, newNote]);
    setEditingId(newNote.id);
    setEditTitle(newNote.title);
    setEditContent(newNote.content);
  };

  const deleteNote = async (id) => {
    setNotes(notes.filter(note => note.id !== id));
    if (editingId === id) {
      setEditingId(null);
    }

    await invoke('deletenote', {
      id: id
    });

    console.log("Deleted Id " + id);
  };

  const startEditing = (note) => {
    setEditingId(note.id);
    setEditTitle(note.title);
    setEditContent(note.content);
  };

  const saveNote = async () => {
    setNotes(notes.map(note => 
      note.id === editingId 
        ? { ...note, title: editTitle, content: editContent }
        : note
    ));

    const allNotesText = notes.map(n => `${n.title}: ${n.content}`).join('\n\n');

    const savedNote = await invoke('embedandsave', {
      title: editTitle,
      note: editContent,
      all: allNotesText
    });

    setNotes(notes.map(note => 
      note.id === editingId ? savedNote : note
    ));

    setEditingId(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditTitle('');
    setEditContent('');
  };

  const sendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage = { role: 'user', content: inputMessage };
    setChatMessages([...chatMessages, userMessage]);
    setInputMessage('');

    // Simulate AI response based on notes
    const allNotesText = notes.map(n => `${n.title}: ${n.content}`).join('\n\n');
    const aiResponse = {
      role: 'assistant',
      content: await invoke('llm_req', {question: inputMessage, notesContext: allNotesText})
    };

    //const res = await invoke('llm_request', {question: inputMessage, notes_context: allNotesText});
    

    setChatMessages(prev => [...prev, aiResponse]);


    
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your notes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-800">AI Notes Assistant</h1>
          <p className="text-sm text-gray-600">Capture ideas and chat with your knowledge</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-6xl mx-auto px-6 mt-6">
        <div className="flex gap-2 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('notes')}
            className={`flex items-center gap-2 px-6 py-3 font-medium transition-all ${
              activeTab === 'notes'
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            <BookOpen size={20} />
            My Notes
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-2 px-6 py-3 font-medium transition-all ${
              activeTab === 'chat'
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            <MessageSquare size={20} />
            Ask AI
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {activeTab === 'notes' ? (
          <div>
            {/* Add Note Button */}
            <button
              onClick={addNote}
              className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition-colors mb-6 shadow-md"
            >
              <Plus size={20} />
              Add New Note
            </button>

            {/* Notes Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {notes.map(note => (
                <div
                  key={note.id}
                  className="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow border border-gray-100"
                >
                  {editingId === note.id ? (
                    <div className="p-6">
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full text-lg font-semibold mb-3 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={6}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                      />
                      <div className="flex gap-2 mt-4">
                        <button
                          onClick={saveNote}
                          className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex-1"
                        >
                          <Save size={16} />
                          Save
                        </button>
                        <button
                          onClick={cancelEditing}
                          className="flex items-center gap-2 bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors flex-1"
                        >
                          <X size={16} />
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-6">
                      <h3 className="text-lg font-semibold text-gray-800 mb-3">{note.title}</h3>
                      <p className="text-gray-600 text-sm mb-4 line-clamp-4">{note.content}</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => startEditing(note)}
                          className="flex items-center gap-2 text-indigo-600 hover:bg-indigo-50 px-4 py-2 rounded-lg transition-colors flex-1 justify-center"
                        >
                          <Edit2 size={16} />
                          Edit
                        </button>
                        <button
                          onClick={() => deleteNote(note.id)}
                          className="flex items-center gap-2 text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg transition-colors flex-1 justify-center"
                        >
                          <Trash2 size={16} />
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {notes.length === 0 && (
              <div className="text-center py-16 text-gray-500">
                <BookOpen size={64} className="mx-auto mb-4 opacity-20" />
                <p className="text-lg">No notes yet. Click "Add New Note" to get started!</p>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-md border border-gray-100 h-[600px] flex flex-col">
            {/* Chat Header */}
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-800">Ask questions about your notes</h2>
              <p className="text-sm text-gray-600 mt-1">
                Currently loaded: {notes.length} note(s)
              </p>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {chatMessages.length === 0 ? (
                <div className="text-center py-16 text-gray-500">
                  <MessageSquare size={64} className="mx-auto mb-4 opacity-20" />
                  <p className="text-lg">Start a conversation about your notes</p>
                  <p className="text-sm mt-2">Try asking: "What are my notes about?" or "Summarize my ideas"</p>
                </div>
              ) : (
                chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[70%] rounded-lg px-4 py-3 ${
                        msg.role === 'user'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Input */}
            <div className="p-6 border-t border-gray-200">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Ask a question about your notes..."
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  onClick={sendMessage}
                  className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}