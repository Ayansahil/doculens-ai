# Doc AI Platform

Doc AI is a modern document analysis and management system that leverages AI to extract insights, flag risks, and provide structured data from your documents.

## Features Implemented

### 1. Dashboard (`Dashboard.jsx`)
- **Real-time Statistics**: Displays Total Documents, Analysed Documents, High Risk Documents, and Storage Used.
- **Visualizations**: Progress bars for storage and trend indicators.
- **Activity Feed**: Tracks recent user actions like uploads and analysis.
- **Recent Documents**: Quick access to recently processed files.

### 2. Document Management (`DocumentList.jsx`)
- **List View**: Tabular display of documents with metadata (Title, Type, Category, Status, Date, Project).
- **Filtering & Sorting**:
  - Filter by Status (All, Analysed, High Risk, Pending OCR).
  - Filter by Type (PDF, DOC, DOCX, TXT).
  - Sort by Date, Title, Type, or Status.
- **Search**: In-list search functionality.
- **Actions**: View, Download, Edit, and Delete capabilities.

### 3. Advanced Search (`SearchBar.jsx`)
- **Global Search**: Search across the entire document repository.
- **Advanced Filters**:
  - Document Type
  - Category (Financial, Legal, Academic, Business)
  - Status
  - Date Range
- **Recent Searches**: History of last 5 searches for quick access.
- **Live Results**: Instant search results with excerpts and highlighting.

### 4. AI Analysis & Chat (`ChatBot.jsx`)
- **Dual Mode Interface**:
  - **Chatbot**: Interactive Q&A with the document context. Includes suggested prompts (Summarize, Translate, Risk Analysis).
  - **Structured Data**: View extracted Key Metrics, Flagged Items (Inconsistencies, Missing Data), and Recommendations.
- **Context Awareness**: AI responses link back to specific pages in the document.

### 5. Document Upload (`DocumentUpload.jsx`)
- **File Handling**: Support for multiple file selection via drag-and-drop or dialog.
- **Validation**: Checks for file validity before processing.
- **Progress Tracking**: Visual feedback during the upload process.
- **Notifications**: Success and error alerts using the App Context.

## Technical Implementation

- **Frontend Framework**: React (Vite)
- **Styling**: Tailwind CSS for responsive and modern UI.
- **Icons**: Lucide React for consistent iconography.
- **State Management**: React Context API (`AppContext`) for global state.
- **Components**: Modular architecture with reusable UI components (`Card`, `Button`, `Badge`, `Input`).

