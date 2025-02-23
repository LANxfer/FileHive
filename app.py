from flask import Flask, render_template, request, jsonify, send_file
import os
from datetime import datetime
import socket
import uuid
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad
from Crypto.Random import get_random_bytes

app = Flask(__name__)

UPLOAD_FOLDER = 'uploads'
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

files_db = []
active_ips = set()  # Use a set to avoid duplicates

# Pre-shared AES key (32 bytes for AES-256)
SECRET_KEY = b'ThisIsASecretKey1234567890123456'
print(f"AES Key (share this with clients): {SECRET_KEY.hex()}")

def get_file_info(filename):
    try:
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        stats = os.stat(file_path)
        return {
            'name': filename,
            'size': stats.st_size,
            'created': stats.st_ctime,
            'modified': stats.st_mtime,
            'accessed': stats.st_atime,
            'created_fmt': datetime.fromtimestamp(stats.st_ctime).strftime('%Y-%m-%d %H:%M:%S'),
            'modified_fmt': datetime.fromtimestamp(stats.st_mtime).strftime('%Y-%m-%d %H:%M:%S'),
            'size_fmt': format_file_size(stats.st_size)
        }
    except OSError as e:
        print(f"Error getting file info for {filename}: {e}")
        return None

def format_file_size(size):
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} PB"

def encrypt_file(input_path, output_path):
    cipher = AES.new(SECRET_KEY, AES.MODE_CBC)
    iv = cipher.iv
    with open(input_path, 'rb') as f:
        plaintext = f.read()
    padded_data = pad(plaintext, AES.block_size)
    ciphertext = cipher.encrypt(padded_data)
    with open(output_path, 'wb') as f:
        f.write(iv + ciphertext)
    return output_path

@app.route('/')
def index():
    global active_ips
    active_ips.add(request.remote_addr)  # Track IP of every visitor
    return render_template('index.html')

@app.route('/get_ips')
def get_ips():
    global active_ips
    active_ips.add(request.remote_addr)  # Track IP of this request
    print(f"Active IPs: {list(active_ips)}")  # Debug output
    return jsonify(list(active_ips))

@app.route('/get_files')
def get_files():
    global active_ips
    user_ip = request.remote_addr
    active_ips.add(user_ip)  # Track IP of this request
    try:
        user_files = [f for f in files_db if f["recipient"] == user_ip or f["recipient"] == "Everyone"]
        files = []
        for file_info in user_files:
            file_details = get_file_info(file_info["encrypted_filename"])
            if file_details:
                file_details['original_name'] = file_info["filename"]
                files.append(file_details)
        
        sort_by = request.args.get('sort', 'name')
        if sort_by not in ['name', 'size', 'created', 'modified', 'accessed']:
            sort_by = 'name'
        sort_order = request.args.get('order', 'asc')
        reverse = sort_order.lower() == 'desc'
        files.sort(key=lambda x: x[sort_by], reverse=reverse)
        return jsonify(files)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/upload', methods=['POST'])
def upload_file():
    global active_ips
    sender = request.remote_addr
    active_ips.add(sender)  # Track IP of uploader
    try:
        if 'file' not in request.files:
            return "No file part", 400
        
        file = request.files['file']
        if file.filename == '':
            return "No selected file", 400

        recipient = request.form.get("recipient", "Everyone")

        original_filename = file.filename
        temp_path = os.path.join(app.config['UPLOAD_FOLDER'], "temp_" + original_filename)
        file.save(temp_path)

        encrypted_filename = f"{original_filename}_{uuid.uuid4().hex[:8]}.enc"
        encrypted_path = os.path.join(app.config['UPLOAD_FOLDER'], encrypted_filename)
        encrypt_file(temp_path, encrypted_path)
        os.remove(temp_path)

        files_db.append({
            "filename": original_filename,
            "encrypted_filename": encrypted_filename,
            "sender": sender,
            "recipient": recipient
        })
        
        file_info = get_file_info(encrypted_filename)
        if file_info:
            file_info['original_name'] = original_filename
            return jsonify({
                'message': "File uploaded and encrypted successfully!",
                'file': file_info
            }), 200
        else:
            return jsonify({'error': "Failed to get file info"}), 500
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/download/<filename>', methods=['GET'])
def download_file(filename):
    global active_ips
    user_ip = request.remote_addr
    active_ips.add(user_ip)  # Track IP of downloader
    file_info = next((f for f in files_db if f["encrypted_filename"] == filename), None)

    if not file_info:
        print(f"Download failed: File {filename} not found")
        return jsonify({"error": "File not found"}), 404

    if file_info["recipient"] != user_ip and file_info["recipient"] != "Everyone":
        print(f"Download failed: Access denied for {user_ip}")
        return jsonify({"error": "Access denied"}), 403

    encrypted_path = os.path.join(UPLOAD_FOLDER, filename)
    print(f"Sending encrypted file {encrypted_path} to {user_ip}")
    return send_file(
        encrypted_path,
        as_attachment=True,
        download_name=filename,
        mimetype='application/octet-stream'
    )

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)