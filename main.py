import json
import eel
import sqlite3
from datetime import datetime
from pathlib import Path
import base64, os

APP_DIR = Path(__file__).parent
DB_PATH = APP_DIR / 'ehr.db'
IMAGES_DIR = APP_DIR / 'uploads'
IMAGES_DIR.mkdir(exist_ok=True)

eel.init('web')

def get_conn():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_conn(); cur = conn.cursor()
    cur.executescript('''
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT,
        fullname TEXT,
        email TEXT,
        phone TEXT,
        national_id TEXT,
        address TEXT,
        dept_id INTEGER,
        assigned_doctor_id INTEGER
    );
    CREATE TABLE IF NOT EXISTS departments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE
    );
    CREATE TABLE IF NOT EXISTS transfers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id INTEGER,
        from_doctor_id INTEGER,
        to_dept_id INTEGER,
        to_doctor_id INTEGER,
        status TEXT DEFAULT 'pending',
        note TEXT,
        created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS transfer_images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transfer_id INTEGER,
        filename TEXT
    );
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id INTEGER,
        receiver_id INTEGER,
        content TEXT,
        created_at TEXT,
        read INTEGER DEFAULT 0,
        is_image INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS complaints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id INTEGER,
        subject TEXT,
        message TEXT,
        image_filename TEXT,
        status TEXT DEFAULT 'open',
        created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS prescriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doctor_id INTEGER,
        patient_id INTEGER,
        medicine TEXT,
        dosage TEXT,
        times_per_day INTEGER,
        duration_days INTEGER,
        notes TEXT,
        created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS vitals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id INTEGER,
        metric TEXT,
        value REAL,
        created_at TEXT
    );
    ''')
    cur.execute("INSERT OR IGNORE INTO users(username,password,role,fullname,email) VALUES(?,?,?,?,?)",
                ('admin','admin','owner','Administrator','admin@example.com'))
    conn.commit(); conn.close()

init_db()

def dict_from_row(row):
    return {k: row[k] for k in row.keys()} if row else None

INTENTS_PATH = Path(__file__).parent / "medical_intents.json"

BASE_DIR = Path(__file__).parent
INTENTS_PATH = BASE_DIR / "medical_intents.json"

with open(INTENTS_PATH, "r", encoding="utf-8") as f:
    MEDICAL_DATA = json.load(f)

@eel.expose
def get_medical_intents():
    return MEDICAL_DATA

@eel.expose
def medical_ai_router(part, text, lang):
    t = (text or "").strip().lower()

    if not part:
        return {
            "type": "advice",
            "message": "اختار جزء من الجسم الأول" if lang == "ar"
                       else "Please select a body part first"
        }

    for intent in MEDICAL_DATA:
        if intent.get("body_part") != part:
            continue

        patterns = intent.get("patterns", [])

        for p in patterns:
            if p.lower() in t:
                responses = intent.get("responses", {})
                return {
                    "type": intent.get("level", "advice"),
                    "message": responses.get(lang) or responses.get("ar") or ""
                }

    return {
        "type": "advice",
        "message": "ممكن توضّح الأعراض أكتر؟" if lang == "ar"
                   else "Can you describe your symptoms more?"
    }

@eel.expose
def get_dashboard_data():
    conn = get_conn()
    cur = conn.cursor()

    cur.execute('SELECT id, name FROM departments ORDER BY name')
    depts = [dict(r) for r in cur.fetchall()]

    cur.execute("""
        SELECT u.id, u.username, u.fullname, u.email, u.phone, u.national_id, u.address, u.dept_id, u.role, 
               d.name AS dept_name
        FROM users u 
        LEFT JOIN departments d ON u.dept_id = d.id
        WHERE u.role='doctor'
    """)
    doctors = [dict(r) for r in cur.fetchall()]

    cur.execute("""
        SELECT u.id, u.username, u.fullname, u.email, u.phone, u.national_id, u.address, u.dept_id,
               u.assigned_doctor_id, u.role,
               d.name AS dept_name,
               doc.fullname AS assigned_doctor_name
        FROM users u 
        LEFT JOIN departments d ON u.dept_id = d.id
        LEFT JOIN users doc ON u.assigned_doctor_id = doc.id
        WHERE u.role='patient'
    """)
    patients = [dict(r) for r in cur.fetchall()]

    cur.execute("""
        SELECT id, username, fullname, email, phone, national_id, address, role 
        FROM users
        WHERE role='administrative'
        ORDER BY fullname
    """)
    administratives = [dict(r) for r in cur.fetchall()]

    conn.close()

    return {
        'depts': depts,
        'doctors': doctors,
        'patients': patients,
        'administratives': administratives
    }

@eel.expose
def get_transfer_extra(patient_id):
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        SELECT t.*, d_from.name AS old_dept_name, d_to.name AS new_dept_name
        FROM transfers t
        LEFT JOIN departments d_from ON d_from.id = t.old_dept
        LEFT JOIN departments d_to ON d_to.id = t.new_dept
        WHERE t.patient_id=?
        ORDER BY t.id DESC LIMIT 1
    """, (patient_id,))
    t = cur.fetchone()

    if not t:
        conn.close()
        return {"status": None}

    if t["status"] == "approved":
        cur.execute("""
            SELECT id, fullname 
            FROM users 
            WHERE role='doctor' AND dept_id=?
        """, (t["new_dept"],))
        doctors = cur.fetchall()
    else:
        doctors = []

    conn.close()
    return {
        "status": t["status"],
        "new_dept": t["new_dept"],
        "doctors": doctors
    }

@eel.expose
def save_new_doctor(patient_id, doctor_id):
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        UPDATE users SET assigned_doctor_id=? WHERE id=?
    """, (doctor_id, patient_id))

    conn.commit()
    conn.close()
    return {"ok": True}

@eel.expose
def login(username, password):
    conn = get_conn(); cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE username=? AND password=?", (username, password))
    r = cur.fetchone()
    conn.close()
    return dict_from_row(r) if r else None

@eel.expose
def send_prescription(doctor_id, patient_id, medicine, dosage, times_per_day, duration_days, notes):
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO prescriptions(doctor_id,patient_id,medicine,dosage,times_per_day,duration_days,notes,created_at)
            VALUES(?,?,?,?,?,?,?,?)
        """, (doctor_id, patient_id, medicine, dosage, times_per_day, duration_days, notes, datetime.utcnow().isoformat()))
        conn.commit()
        conn.close()
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@eel.expose
def get_prescriptions_for_patient(patient_id):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT p.*, u.fullname AS doctor_name
        FROM prescriptions p
        LEFT JOIN users u ON p.doctor_id = u.id
        WHERE patient_id=?
        ORDER BY id DESC
    """, (patient_id,))
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]

@eel.expose
def get_last_transfer(patient_id):
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        SELECT 
            t.*,
            d2.name AS new_dept_name,
            u1.fullname AS old_doctor_name,
            u2.fullname AS new_doctor_name,
            d1.name AS old_dept_name
        FROM transfers t
        LEFT JOIN users u1 ON t.from_doctor_id = u1.id
        LEFT JOIN departments d1 ON u1.dept_id = d1.id
        LEFT JOIN departments d2 ON t.to_dept_id = d2.id
        LEFT JOIN users u2 ON t.to_doctor_id = u2.id
        WHERE t.patient_id=?
        ORDER BY t.id DESC LIMIT 1
    """, (patient_id,))

    row = cur.fetchone()
    conn.close()

    return dict(row) if row else None

@eel.expose
def assign_new_doctor_after_transfer(transfer_id, doctor_id):
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        UPDATE users
        SET assigned_doctor_id = ?
        WHERE id = (SELECT patient_id FROM transfers WHERE id=?)
    """, (doctor_id, transfer_id))

    cur.execute("""
        UPDATE transfers
        SET to_doctor_id = ?
        WHERE id=?
    """, (doctor_id, transfer_id))

    conn.commit()
    conn.close()
    return {"ok": True}

@eel.expose
def get_doctors_in_department(dept_id):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, fullname 
        FROM users 
        WHERE role='doctor' AND dept_id=?
    """, (dept_id,))
    rows = cur.fetchall()
    conn.close()
    return [{"id": r["id"], "fullname": r["fullname"]} for r in rows]

@eel.expose
def assign_new_doctor(patient_id, new_doctor_id):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("UPDATE users SET assigned_doctor_id=? WHERE id=?", (new_doctor_id, patient_id))
    conn.commit()
    conn.close()
    return {"ok": True}

@eel.expose
def get_complaint_messages(patient_id):
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        SELECT message, image_filename, created_at
        FROM complaints
        WHERE patient_id = ?
        ORDER BY id ASC
    """, (patient_id,))

    result = []
    for row in cur.fetchall():
        msg = row["message"] or ""
        img = row["image_filename"]

        result.append({
            "message": msg,
            "image": img,
            "created_at": row["created_at"]
        })

    conn.close()
    return result

@eel.expose
def send_message(sender_id, receiver_id, content, is_image=0):
    try:
        conn = get_conn(); cur = conn.cursor()
        cur.execute('INSERT INTO messages(sender_id,receiver_id,content,created_at,read,is_image) VALUES(?,?,?,?,?,?)',
                    (sender_id, receiver_id, content, datetime.now().isoformat(), 0, is_image))
        conn.commit(); conn.close()
        return {'ok': True}
    except Exception as e:
        return {'ok': False, 'error': str(e)}

@eel.expose
def send_patient_complaint(patient_id, content, is_image=0):
    conn = get_conn(); cur = conn.cursor()
    now_ts = datetime.now().isoformat()

    if is_image == 1:
        cur.execute("""
            INSERT INTO complaints (patient_id, image_filename, created_at)
            VALUES (?, ?, ?)
        """, (patient_id, content, now_ts))
    else:
        cur.execute("""
            INSERT INTO complaints (patient_id, message, created_at)
            VALUES (?, ?, ?)
        """, (patient_id, content, now_ts))

    conn.commit(); conn.close()
    return {"ok": True}

@eel.expose
def send_admin_message(patient_id, content, is_image=0, img_b64=None):
    conn = get_conn(); cur = conn.cursor()
    now_ts = datetime.now().isoformat()
    final_msg = "[ADMIN]" + (content if content else "")

    if is_image == 1:
        cur.execute("""
            INSERT INTO complaints (patient_id, image_filename, created_at, message)
            VALUES (?, ?, ?, ?)
        """, (patient_id, img_b64, now_ts, final_msg))
    else:
        cur.execute("""
            INSERT INTO complaints (patient_id, message, created_at)
            VALUES (?, ?, ?)
        """, (patient_id, final_msg, now_ts))

    conn.commit(); conn.close()
    return {"ok": True}

@eel.expose
def submit_transfer_request(patient_id, from_doctor_id, to_dept_id, note):
    try:
        conn = get_conn(); cur = conn.cursor()
        cur.execute("""
            INSERT INTO transfers(patient_id,from_doctor_id,to_dept_id,status,note,created_at)
            VALUES(?,?,?,?,?,?)
        """, (patient_id, from_doctor_id, to_dept_id, 'pending', note, datetime.now().isoformat())) 
        tid = cur.lastrowid
        conn.commit(); conn.close()
        return {'ok': True, 'id': tid}
    except Exception as e:
        return {'ok': False, 'error': str(e)}

@eel.expose
def get_admin_user():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT id, fullname FROM users WHERE role IN ('administrative','owner') LIMIT 1")
    r = cur.fetchone()
    conn.close()
    return dict(r) if r else None

@eel.expose
def update_user(user_id, data):
    conn = get_conn()
    cur = conn.cursor()

    fields = []
    values = []

    for key, value in data.items():
        fields.append(f"{key}=?")
        values.append(value)

    values.append(user_id)

    cur.execute(f"UPDATE users SET {', '.join(fields)} WHERE id=?", values)

    conn.commit()
    conn.close()
    return {"ok": True}


@eel.expose
def reset_password(user_id, new_pass):
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        UPDATE users 
        SET password=? 
        WHERE id=?
    """, (new_pass, user_id))

    conn.commit()
    conn.close()
    return {"ok": True}


@eel.expose
def get_analytics_data():
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        SELECT DATE(created_at) AS day, COUNT(*) AS total
        FROM transfers
        GROUP BY DATE(created_at)
        ORDER BY DATE(created_at)
    """)
    transfers_per_day = [dict(r) for r in cur.fetchall()]

    cur.execute("""
        SELECT status, COUNT(*) AS total
        FROM transfers
        GROUP BY status
    """)
    transfer_status = [dict(r) for r in cur.fetchall()]

    cur.execute("""
        SELECT d.name AS dept, COUNT(u.id) AS total
        FROM departments d
        LEFT JOIN users u ON u.dept_id = d.id AND u.role='patient'
        GROUP BY d.id
    """)
    patient_status = [dict(r) for r in cur.fetchall()]

    conn.close()
    return {
        "per_day": transfers_per_day,
        "status": transfer_status,
        "patients": patient_status
    }


@eel.expose
def delete_user(user_id):
    try:
        conn = get_conn(); cur = conn.cursor()
        cur.execute("DELETE FROM users WHERE id=?", (user_id,))
        conn.commit()
        conn.close()
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@eel.expose
def delete_department(dept_id):
    try:
        conn = get_conn()
        cur = conn.cursor()

        cur.execute("UPDATE users SET dept_id=NULL WHERE dept_id=?", (dept_id,))
        cur.execute("DELETE FROM departments WHERE id=?", (dept_id,))

        conn.commit()
        conn.close()
        return {"ok": True}

    except Exception as e:
        return {"ok": False, "error": str(e)}


@eel.expose
def get_transfer_requests():
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        SELECT 
            t.id, t.patient_id, t.from_doctor_id, t.to_dept_id, 
            t.to_doctor_id, t.status, t.note, t.created_at,

            -- المريض
            p.fullname AS patient_name,

            -- الطبيب القديم
            d_from.fullname AS from_doctor_name,

            -- التخصص القديم
            dept_old.name AS old_dept_name,

            -- التخصص الجديد
            dept_new.name AS new_dept_name,

            -- الطبيب الجديد
            d_new.fullname AS new_doctor_name

        FROM transfers t
        LEFT JOIN users p ON p.id = t.patient_id
        LEFT JOIN users d_from ON d_from.id = t.from_doctor_id
        LEFT JOIN departments dept_old ON dept_old.id = d_from.dept_id
        LEFT JOIN departments dept_new ON dept_new.id = t.to_dept_id
        LEFT JOIN users d_new ON d_new.id = t.to_doctor_id
        ORDER BY t.id DESC
    """)

    rows = cur.fetchall()

    result = []
    for r in rows:
        row = dict(r)

        cur.execute("SELECT filename FROM transfer_images WHERE transfer_id=?", (row["id"],))
        imgs = [x["filename"] for x in cur.fetchall()]
        row["images"] = imgs

        result.append(row)

    conn.close()
    return result

@eel.expose
def approve_transfer(transfer_id, new_doctor_id):
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("SELECT patient_id, to_dept_id FROM transfers WHERE id=?", (transfer_id,))
    row = cur.fetchone()

    if not row:
        conn.close()
        return {"ok": False, "error": "Transfer not found"}

    patient_id = row["patient_id"]
    new_dept_id = row["to_dept_id"]

    cur.execute("""
        UPDATE transfers 
        SET status='approved', to_doctor_id=? 
        WHERE id=?
    """, (new_doctor_id, transfer_id))

    cur.execute("""
        UPDATE users 
        SET assigned_doctor_id=?, dept_id=?
        WHERE id=?
    """, (new_doctor_id, new_dept_id, patient_id))

    conn.commit()
    conn.close()

    return {"ok": True}

@eel.expose
def reject_transfer(transfer_id):
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        UPDATE transfers 
        SET status='rejected' 
        WHERE id=?
    """, (transfer_id,))

    conn.commit()
    conn.close()
    return {"ok": True}

@eel.expose
def add_department(name):
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("INSERT INTO departments(name) VALUES(?)", (name,))
        conn.commit()
        dept_id = cur.lastrowid
        conn.close()
        return {"ok": True, "id": dept_id}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@eel.expose
def get_doctor_info(doctor_id):
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        SELECT u.id, u.fullname, u.phone, u.email, u.address, 
               u.dept_id, d.name AS dept_name
        FROM users u
        LEFT JOIN departments d ON d.id = u.dept_id
        WHERE u.id = ? AND u.role = 'doctor'
    """, (doctor_id,))
    row = cur.fetchone()

    if not row:
        conn.close()
        return {"ok": False, "error": "Doctor not found"}

    doctor = dict(row)

    cur.execute("""
        SELECT COUNT(*) AS total
        FROM users
        WHERE role = 'patient' AND assigned_doctor_id = ?
    """, (doctor_id,))
    doctor["total_patients"] = cur.fetchone()["total"]

    conn.close()
    return {"ok": True, "doctor": doctor}

@eel.expose
def get_patients_for_doctor(doctor_id):
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        SELECT id, fullname, phone, address
        FROM users
        WHERE role='patient' AND assigned_doctor_id=?
        ORDER BY fullname
    """, (doctor_id,))

    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]

@eel.expose
def search_patients(query):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT id, fullname, phone FROM users WHERE role='patient' AND fullname LIKE ?", (f"%{query}%",))
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]

@eel.expose
def create_user(role, fullname, username, email, phone, national_id, address, password, dept_id=None, assigned_doctor_id=None):
    try:
        conn = get_conn()
        cur = conn.cursor()

        cur.execute("""
            INSERT INTO users (role, fullname, username, email, phone, national_id, address, password, dept_id, assigned_doctor_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (role, fullname, username, email, phone, national_id, address, password, dept_id, assigned_doctor_id))

        conn.commit()
        conn.close()
        return {"ok": True}

    except Exception as e:
        return {"ok": False, "error": str(e)}

@eel.expose
def get_messages_between(a_id, b_id, limit=500):
    conn = get_conn(); cur = conn.cursor()
    cur.execute(
        'SELECT id,sender_id,receiver_id,content,created_at,read,is_image '
        'FROM messages WHERE (sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?) '
        'ORDER BY id ASC LIMIT ?',
        (a_id, b_id, b_id, a_id, limit)
    )
    rows = [dict(r) for r in cur.fetchall()]; conn.close(); 
    return rows


@eel.expose
def mark_messages_read(from_id, to_id):
    try:
        conn = get_conn(); cur = conn.cursor()
        cur.execute('UPDATE messages SET read=1 WHERE sender_id=? AND receiver_id=?', (from_id, to_id))
        conn.commit(); conn.close()
        return {'ok': True}
    except Exception as e:
        return {'ok': False, 'error': str(e)}

@eel.expose
def add_vital_measurement(patient_id, metric, value):
    try:
        conn = get_conn(); cur = conn.cursor()
        cur.execute(
            'INSERT INTO vitals(patient_id,metric,value,created_at) VALUES(?,?,?,?)',
            (patient_id, metric, value, datetime.utcnow().isoformat())
        )
        conn.commit(); conn.close()
        return {'ok': True}
    except Exception as e:
        return {'ok': False, 'error': str(e)}


@eel.expose
def get_vitals(patient_id, metric=None, limit=500):
    conn = get_conn(); cur = conn.cursor()
    if metric:
        cur.execute(
            'SELECT id,metric,value,created_at FROM vitals WHERE patient_id=? AND metric=? ORDER BY created_at ASC LIMIT ?',
            (patient_id, metric, limit)
        )
    else:
        cur.execute(
            'SELECT id,metric,value,created_at FROM vitals WHERE patient_id=? ORDER BY created_at ASC LIMIT ?',
            (patient_id, limit)
        )
    rows = [dict(r) for r in cur.fetchall()]; conn.close()
    return rows

@eel.expose
def get_patients_with_complaints():
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        SELECT 
            c.patient_id,
            u.fullname,
            COUNT(*) AS total_msgs,
            MAX(c.created_at) AS last_time
        FROM complaints c
        LEFT JOIN users u ON u.id = c.patient_id
        GROUP BY c.patient_id
        ORDER BY last_time DESC
    """)

    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@eel.expose
def get_unread_count(admin_id):
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        SELECT COUNT(*) AS unread
        FROM messages
        WHERE receiver_id = ?
        AND read = 0
    """, (admin_id,))

    row = cur.fetchone()
    conn.close()
    return row["unread"] if row else 0


@eel.expose
def send_image(sender, receiver, img_base64):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO messages (sender_id, receiver_id, content, is_image, created_at)
        VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
    """, (sender, receiver, img_base64))
    conn.commit()
    conn.close()
    return True

@eel.expose
def delete_conversation(admin_id, patient_id):
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        DELETE FROM messages 
        WHERE (sender_id = ? AND receiver_id = ?)
        OR   (sender_id = ? AND receiver_id = ?)
    """, (admin_id, patient_id, patient_id, admin_id))

    conn.commit()
    conn.close()
    return True

if __name__ == '__main__':
    eel.start('index.html', size=(1100,720))