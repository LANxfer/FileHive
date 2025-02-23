from flask import Flask, render_template, request, jsonify, send_from_directory, send_file
import os
from datetime import datetime
import socket
import subprocess
import threading

app = Flask(__name__)

UPLOAD_FOLDER = 'uploads'
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Ensure the uploads directory exists
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

# Simulated database storing file info
files_db = []  # List of { "filename": ..., "sender": ..., "recipient": ... }
active_ips = []  # Cache for active IPs

def get_file_info(filename):
    """Get detailed file information including timestamps and size"""
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    stats = os.stat(file_path)
    
    return {
        'name': filename,
        'size': stats.st_size,  # File size in bytes
        'created': stats.st_ctime,  # Creation timestamp
        'modified': stats.st_mtime,  # Last modification timestamp
        'accessed': stats.st_atime,  # Last access timestamp
        'created_fmt': datetime.fromtimestamp(stats.st_ctime).strftime('%Y-%m-%d %H:%M:%S'),
        'modified_fmt': datetime.fromtimestamp(stats.st_mtime).strftime('%Y-%m-%d %H:%M:%S'),
        'size_fmt': format_file_size(stats.st_size)
    }

def format_file_size(size):
    """Convert file size in bytes to human-readable format"""
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} PB"

def scan_network():
    """Periodically scan the LAN for active IPs"""
    global active_ips
    while True:
        try:
            hostname = socket.gethostname()
            local_ip = socket.gethostbyname(hostname)
            network_prefix = ".".join(local_ip.split(".")[:-1])
            temp_ips = []
            lock = threading.Lock()

            def ping_ip(ip):
                if ip != local_ip:
                    try:
                        subprocess.check_output(
                            ["ping", "-n", "1", "-w", "100", ip],
                            stderr=subprocess.STDOUT,
                            shell=True  # Required for Windows
                        )
                        with lock:
                            temp_ips.append(ip)
                    except:
                        pass

            threads = []
            for i in range(1, 255):
                ip = f"{network_prefix}.{i}"
                t = threading.Thread(target=ping_ip, args=(ip,))
                threads.append(t)
                t.start()

            for t in threads:
                t.join()

            with lock:
                active_ips = temp_ips  # Update global list
        except Exception as e:
            print(f"Error scanning network: {e}")
        threading.Event().wait(10)  # Scan every 10 seconds

# Start network scanning in the background
threading.Thread(target=scan_network, daemon=True).start()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/get_ips')
def get_ips():
    """Returns a list of available IPs on the same network"""
    return jsonify(active_ips)

@app.route('/get_files')
def get_files():
    """Returns a list of files with detailed information"""
    try:
        user_ip = request.remote_addr
        user_files = [f for f in files_db if f["recipient"] == user_ip or f["recipient"] == "Everyone"]

        files = []
        for file_info in user_files:
            try:
                file_details = get_file_info(file_info["filename"])
                files.append(file_details)
            except OSError as e:
                print(f"Error getting info for file {file_info['filename']}: {e}")
                continue
        
        # Sort parameter handling
        sort_by = request.args.get('sort', 'name')  # Default sort by name
        sort_order = request.args.get('order', 'asc')  # Default ascending order
        
        # Sort files based on request parameters
        reverse = sort_order.lower() == 'desc'
        files.sort(key=lambda x: x[sort_by], reverse=reverse)
        
        return jsonify(files)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    """Serves uploaded files"""
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/upload', methods=['POST'])
def upload_file():
    """Handles file uploads"""
    try:
        if 'file' not in request.files:
            return "No file part", 400
        
        file = request.files['file']
        if file.filename == '':
            return "No selected file", 400

        # Get recipient from form data
        recipient = request.form.get("recipient", "Everyone")
        sender = request.remote_addr

        # Get the file path
        filename = file.filename
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        
        # Save the file
        file.save(file_path)
        
        # Store file metadata
        files_db.append({
            "filename": filename,
            "sender": sender,
            "recipient": recipient
        })
        
        # Get and return the file info
        file_info = get_file_info(filename)
        return jsonify({
            'message': "File uploaded successfully!",
            'file': file_info
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/download/<filename>', methods=['GET'])
def download_file(filename):
    """Allows only the recipient to download the file"""
    user_ip = request.remote_addr
    file_info = next((f for f in files_db if f["filename"] == filename), None)

    if not file_info:
        return jsonify({"error": "File not found"}), 404

    if file_info["recipient"] != user_ip and file_info["recipient"] != "Everyone":
        return jsonify({"error": "Access denied"}), 403

    file_path = os.path.join(UPLOAD_FOLDER, filename)
    return send_file(file_path, as_attachment=True)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)