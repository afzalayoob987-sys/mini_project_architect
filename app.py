from flask import Flask, render_template, request, jsonify, redirect, url_for  # type: ignore
import os
import uuid
import random
import string
from werkzeug.utils import secure_filename  # type: ignore
from plan_parser import parse_floor_plan  # type: ignore

app = Flask(__name__)

# Configuration
UPLOAD_FOLDER = 'static/uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'pdf'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Simple In-Memory Data Storage
# projects = { "ARCH123": { "filename": "plan.jpg", "comments": [], "status": "generated" } }
projects = {}

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def generate_access_code():
    return "PROJ-" + str(random.randint(10, 99))

# --- ROUTES ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/architect')
def architect_view():
    return render_template('architect.html')

@app.route('/client')
def client_login():
    return render_template('client_login.html')

@app.route('/client/view/<access_code>')
def client_view(access_code):
    if access_code in projects:
        return render_template('client_view.html', access_code=access_code)
    return "Invalid Access Code", 404

# --- API ENDPOINTS ---

@app.route('/api/generate_code', methods=['POST'])
def api_generate_code():
    data = request.json
    filename = data.get('filename')
    
    code = generate_access_code()
    # Ensure uniqueness
    while code in projects:
        code = generate_access_code()
        
    projects[code] = {
        "filename": filename,
        "comments": [],
        "created_at": "Today"
    }
    return jsonify({"success": True, "access_code": code}), 200

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    file = request.files['file']
    if file.filename == '' or not allowed_file(file.filename):
        return jsonify({"error": "Invalid file"}), 400
    
    filename = secure_filename(file.filename)
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(file_path)
    return jsonify({"success": True, "filename": filename}), 200

@app.route('/api/project/<access_code>', methods=['GET'])
def get_project(access_code):
    if access_code in projects:
        return jsonify({"success": True, "project": projects[access_code]}), 200
    return jsonify({"error": "Not found"}), 404

@app.route('/api/comment', methods=['POST'])
def add_comment():
    data = request.json or {}
    code = data.get('access_code')
    text = data.get('text')
    
    if code and code in projects:
        project_data = projects[code]
        if isinstance(project_data, dict):
            # Explicitly fetch and verify the comments list for the static analyzer
            comments = project_data.get('comments')
            if not isinstance(comments, list):
                comments = []
                project_data['comments'] = comments
                
            comment = {"text": text, "timestamp": "Just now"}
            comments.append(comment)
            return jsonify({"success": True}), 200
    return jsonify({"error": "Project not found"}), 404

@app.route('/api/notifications', methods=['GET'])
def get_notifications():
    all_comments = []
    # Use explicit types or safer traversal for analyzer
    for proj_code, proj_data in projects.items():
        if isinstance(proj_data, dict) and 'comments' in proj_data:
            for c in proj_data['comments']:
                if isinstance(c, dict):
                    all_comments.append({
                        "project": proj_code,
                        "text": c.get('text', ''),
                        "time": c.get('timestamp', 'Unknown')
                    })
    return jsonify({"success": True, "notifications": all_comments}), 200

@app.route('/alter_design', methods=['POST'])
def alter_design():
    data = request.json or {}
    prompt = data.get('prompt', '')
    model_ref = data.get('model_ref', 'default')
    print(f"AI Alteration Requested: {prompt} for model {model_ref}")
    return jsonify({
        "success": True,
        "message": f"AI Design Update: '{prompt}' requested. Rebuilding model...",
        "new_status": "AI Optimized"
    }), 200


@app.route('/api/parse_plan', methods=['POST'])
def api_parse_plan():
    """Parse a floor plan image and return structured room/wall data."""
    data = request.json or {}
    filename = data.get('filename', '')
    if not filename:
        return jsonify({"error": "No filename provided"}), 400

    image_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    try:
        plan_data = parse_floor_plan(image_path)
        return jsonify({"success": True, "plan_data": plan_data}), 200
    except Exception as e:
        print(f"Plan parse error: {e}")
        return jsonify({"error": f"Parse failed: {str(e)}"}), 500


@app.route('/api/generate_3d', methods=['POST'])
def api_generate_3d():
    """
    Accept plan_data + style_prompt, attach to existing project (if access_code given),
    and return confirmation. The actual 3D build happens entirely in Three.js on the
    front-end; this route stores the style intent server-side.
    """
    data = request.json or {}
    plan_data = data.get('plan_data')
    style_prompt = data.get('style_prompt', '')
    access_code = data.get('access_code', '')

    if not plan_data:
        return jsonify({"error": "No plan_data provided"}), 400

    # Persist style on project record if it exists
    if access_code and access_code in projects:
        projects[access_code]['style_prompt'] = style_prompt
        projects[access_code]['plan_data'] = plan_data

    # Parse style keywords for material hints sent back to client
    style_lower = style_prompt.lower()
    material_preset = "default"
    if any(k in style_lower for k in ['wood', 'wooden']):
        material_preset = "wood"
    elif any(k in style_lower for k in ['marble', 'stone']):
        material_preset = "marble"
    elif any(k in style_lower for k in ['minimalist', 'minimal', 'white']):
        material_preset = "minimalist"
    elif any(k in style_lower for k in ['modern', 'glass', 'steel']):
        material_preset = "modern"
    elif any(k in style_lower for k in ['luxury', 'gold', 'premium']):
        material_preset = "luxury"

    print(f"3D Generate: {plan_data.get('room_count', '?')} rooms, style='{style_prompt}', preset={material_preset}")

    return jsonify({
        "success": True,
        "material_preset": material_preset,
        "room_count": plan_data.get('room_count', 0),
        "message": f"Scene data ready. Rendering {plan_data.get('room_count', 0)} rooms with '{material_preset}' style."
    }), 200

if __name__ == '__main__':
    # Using 5001 as previously established
    app.run(debug=True, port=5001)
