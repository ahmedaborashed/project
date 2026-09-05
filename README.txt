NURSING ROOM PROJECT

Project Overview
The Nursing Room Project is a healthcare support system designed to assist nursing staff by providing fast, organized, and reliable medical guidance.
The system integrates a rule-based medical chatbot that answers common medical questions, helping reduce workload and improve efficiency inside nursing rooms.

The project is built using Python for backend logic and Eel to connect Python with an interactive HTML/CSS/JavaScript frontend.

--------------------------------------------------

Objectives
- Reduce repetitive questions handled by nurses
- Provide instant medical guidance based on predefined rules
- Improve efficiency and response time in nursing rooms
- Offer a simple and user-friendly interface
- Support both Arabic and English medical responses

--------------------------------------------------

System Features
- Medical Chatbot
  * Rule-based medical decision system
  * Supports multiple body parts (head, chest, stomach, back, legs, etc.)
  * Bilingual support (Arabic / English)

- User Interface
  * Interactive body part selection
  * Dynamic medical questions and answers
  * Clean and simple design

- Database System
  * Local SQLite database
  * Stores users and medical interaction data
  * Ensures data integrity and reliability

- Offline System
  * Works locally without internet connection

--------------------------------------------------

Technologies Used
- Python 3
- Eel (Python ↔ Frontend bridge)
- HTML5
- CSS3
- JavaScript
- SQLite

--------------------------------------------------

Project Structure
nursing room project/
|
|-- main.py                 Application entry point
|-- database.py             Database initialization and queries
|-- medical_data.json       Medical intents and responses
|
|-- web/
|   |-- index.html          Main user interface
|   |-- style.css           Styling and dark mode
|   |-- script.js           Frontend logic and Eel calls
|
|-- uploads/                Uploaded images (if used)
|-- ehr.db                  SQLite database
|-- README.txt              Project documentation

--------------------------------------------------

How to Run the Project
1. Install Python 3
2. Install required library:
   pip install eel
3. Run the application:
   python main.py
4. The system will open automatically in your default browser.

--------------------------------------------------

Medical Chatbot Workflow
1. User selects a body part
2. User enters symptoms
3. The system matches symptoms with predefined patterns
4. A medical response is returned based on severity level:
   - Advice
   - Warning

All chatbot data is stored in JSON format, making it easy to edit and expand.

--------------------------------------------------

Limitations
- The chatbot is rule-based (not AI or ML based)
- Limited to predefined medical rules
- Not a replacement for professional medical diagnosis

--------------------------------------------------

Future Enhancements
- Add machine learning for intent classification
- Voice input support
- Mobile-friendly interface
- Doctor and nurse role management
- Cloud database integration

--------------------------------------------------

Developer
- ahmed abdelghany sherif

--------------------------------------------------

Disclaimer
This project is developed for educational purposes only and should not be used as a substitute for professional medical advice or diagnosis.
