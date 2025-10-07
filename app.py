import os
import json
import base64
import io
from flask import Flask, jsonify, request, send_file, url_for, render_template
import atexit
import time
import string
import cv2
from PIL import Image, ExifTags, TiffImagePlugin, ImageOps

app = Flask(__name__, static_folder='static', template_folder='templates')
CONFIG_FILE = os.path.join('settings', 'config.json')
USER_HOME_DIR = os.path.expanduser('~')
GEO_CACHE_FILE = os.path.join('cache', 'geopy.json')
GEO_CACHE = {}

def load_geo_cache():
    """Loads the geolocation cache from a file into memory."""
    global GEO_CACHE
    if not os.path.exists('cache'):
        os.makedirs('cache')
    if os.path.exists(GEO_CACHE_FILE):
        with open(GEO_CACHE_FILE, 'r', encoding='utf-8') as f:
            try:
                GEO_CACHE = json.load(f)
            except json.JSONDecodeError:
                GEO_CACHE = {}

def save_geo_cache():
    """Saves the in-memory geolocation cache to a file."""
    with open(GEO_CACHE_FILE, 'w', encoding='utf-8') as f:
        json.dump(GEO_CACHE, f, indent=4, ensure_ascii=False)

def load_config():
    """Loads configuration, applying default values for missing keys."""
    defaults = {
        'image_folders': [],
        'gallery_grid_size': 200
    }
    if not os.path.exists(CONFIG_FILE):
        return defaults
    try:
        with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
            user_config = json.load(f)
        defaults.update(user_config)
        return defaults
    except (json.JSONDecodeError, FileNotFoundError):
        return defaults

def save_config(config):
    # Ensure the settings directory exists before saving.
    os.makedirs(os.path.dirname(CONFIG_FILE), exist_ok=True)
    with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=4)

# Load cache at startup and register save on exit
@app.teardown_appcontext
def teardown_db(exception):
    save_geo_cache()

load_geo_cache()
 
@app.after_request
def log_request(response):
    """Log each request's method, path, and status code."""
    app.logger.info(f'{request.method} {request.path} {response.status}')
    return response

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/gallery.html')
def gallery():
    return render_template('gallery.html')

@app.route('/api/browse', methods=['POST'])
def browse_folders():
    """Provides a list of subdirectories for a given path."""
    data = request.get_json()
    req_path = data.get('path')
    show_hidden = data.get('show_hidden', False)

    # If path is not provided, default to Desktop, falling back to home.
    if not req_path:
        desktop_path = os.path.join(USER_HOME_DIR, 'Desktop')
        safe_path = desktop_path if os.path.isdir(desktop_path) else USER_HOME_DIR
    else:
        safe_path = os.path.abspath(req_path)

    # Security check: ensure path exists
    if not os.path.exists(safe_path):
        return jsonify({'error': 'Path does not exist.'}), 404


    try:
        if not os.path.isdir(safe_path):
            raise ValueError("Path is not a valid directory.")

        dirs = []
        files = []
        IMAGE_EXTS = ('.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp')
        VIDEO_EXTS = ('.mp4', '.webm', '.mov', '.avi', '.mkv')
        MEDIA_EXTS = IMAGE_EXTS + VIDEO_EXTS

        for item in os.listdir(safe_path):
            if not show_hidden and (item.startswith('.') or item.startswith('$')):
                continue

            item_path = os.path.join(safe_path, item)
            if os.path.isdir(item_path):
                try:
                    files_in_subdir = os.listdir(item_path)
                    image_count = len([f for f in files_in_subdir if f.lower().endswith(IMAGE_EXTS)])
                    video_count = len([f for f in files_in_subdir if f.lower().endswith(VIDEO_EXTS)])
                    dirs.append({'name': item, 'image_count': image_count, 'video_count': video_count})
                except OSError:
                    dirs.append({'name': item, 'image_count': -1, 'video_count': -1}) # Indicate inaccessible folder
            elif item.lower().endswith(MEDIA_EXTS):
                files.append(item)

        parent_dir = os.path.dirname(safe_path)
        # Check if the parent is a drive root (e.g., 'C:\')
        is_root = parent_dir == safe_path
        # The parent path should be the parent directory, unless it's the root.
        # For root, we don't provide a parent to prevent going "above" the drive.
        parent_path = parent_dir if not is_root else None

        # Count media files in the current directory from the 'files' list
        current_image_count = len([f for f in files if f.lower().endswith(IMAGE_EXTS)])
        current_video_count = len([f for f in files if f.lower().endswith(VIDEO_EXTS)])

        return jsonify({
            'current_path': safe_path,
            'parent_path': parent_path,
            'directories': sorted(dirs, key=lambda d: d['name']),
            'files': sorted(files),
            'current_image_count': current_image_count,
            'current_video_count': current_video_count
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/drives')
def get_drives():
    """Returns a list of available system drives."""
    drives = [f"{d}:\\" for d in string.ascii_uppercase if os.path.exists(f"{d}:")]
    return jsonify(drives)

@app.route('/api/folders')
def get_folders():
    config = load_config()
    folder_data = []
    image_folders = config.get('image_folders', [])

    # --- Migration for old config format ---
    migrated = False
    for i, folder in enumerate(image_folders):
        if isinstance(folder, str):
            image_folders[i] = {'path': folder, 'added_on': time.time()}
            migrated = True
    if migrated:
        config['image_folders'] = image_folders
        save_config(config)
    # --- End Migration ---

    for folder_info in image_folders:
        folder_path = folder_info.get('path')
        try:
            if os.path.isdir(folder_path):
                media_extensions = ('.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.mp4', '.webm', '.mov', '.avi', '.mkv')
                media_count = len([f for f in os.listdir(folder_path) if f.lower().endswith(media_extensions)])
                folder_data.append({'path': folder_path, 'media_count': media_count, 'added_on': folder_info.get('added_on')})
        except Exception: pass
    return jsonify(folder_data)

@app.route('/api/settings', methods=['GET', 'POST'])
def handle_settings():
    """Handles getting and saving application settings."""
    if request.method == 'POST':
        data = request.get_json()
        config = load_config()
        config.update(data)
        save_config(config)
        return jsonify({'success': True})
    else: # GET
        return jsonify(load_config())

@app.route('/api/add_folder', methods=['POST'])
def add_folder():
    data = request.get_json()
    folder_path = data.get('path')
    if not folder_path or not os.path.isdir(folder_path):
        return jsonify({'success': False, 'error': 'Invalid or non-existent path.'}), 400
    config = load_config()
    # Check if path already exists
    if not any(f.get('path') == folder_path for f in config['image_folders']):
        config['image_folders'].append({'path': folder_path, 'added_on': time.time()})
        save_config(config)
    return jsonify({'success': True, 'path': folder_path})

@app.route('/api/delete_folder', methods=['POST'])
def delete_folder():
    data = request.get_json()
    folder_path = data.get('path')
    if not folder_path:
        return jsonify({'success': False, 'error': 'Path is required.'}), 400
    config = load_config()
    # Rebuild the list excluding the folder to be deleted
    config['image_folders'] = [f for f in config['image_folders'] if f.get('path') != folder_path]
    save_config(config)
    return jsonify({'success': True})

@app.route('/api/images')
def list_images():
    config = load_config()
    all_images = []
    for folder_info in config.get('image_folders', []):
        try:
            folder_path = folder_info.get('path')
            if not folder_path:
                continue

            if os.path.isdir(folder_path):
                for filename in os.listdir(folder_path):
                    IMAGE_EXTS = ('.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp')
                    VIDEO_EXTS = ('.mp4', '.webm', '.mov', '.avi', '.mkv')
                    
                    file_lower = filename.lower()
                    if file_lower.endswith(IMAGE_EXTS) or file_lower.endswith(VIDEO_EXTS):
                        try:
                            full_path = os.path.join(folder_path, filename)
                            encoded_path = base64.urlsafe_b64encode(full_path.encode()).decode()
                            
                            img_data = {
                                'src': f'/image/{encoded_path}',
                                'filename': filename,
                                'encoded_path': encoded_path,
                                'mtime': os.path.getmtime(full_path),
                                'type': 'image' if file_lower.endswith(IMAGE_EXTS) else 'video'
                            }
                            all_images.append(img_data)
                        except Exception:
                            continue # Skip files that can't be processed
        except Exception: continue
    
    # Sort images by modification time, newest first
    all_images.sort(key=lambda x: x.get('mtime', 0), reverse=True)
    
    return jsonify(all_images)

@app.route('/image/<encoded_path>')
def serve_image(encoded_path):
    try:
        decoded_path = base64.urlsafe_b64decode(encoded_path).decode()
        if os.path.exists(decoded_path):
            return send_file(decoded_path)
        else: return "File not found", 404
    except Exception: return "Invalid path", 400

@app.route('/api/metadata/<encoded_path>')
def get_metadata(encoded_path):
    """Returns basic metadata for a single image, including reverse-geocoded location."""
    img_data = {'width': 'N/A', 'height': 'N/A'}
    try:
        decoded_path = base64.urlsafe_b64decode(encoded_path).decode()
        
        VIDEO_EXTS = ('.mp4', '.webm', '.mov', '.avi', '.mkv')
        if decoded_path.lower().endswith(VIDEO_EXTS):
            cap = cv2.VideoCapture(decoded_path)
            if cap.isOpened():
                img_data['width'] = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                img_data['height'] = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                cap.release()
        else: # It's an image
            with Image.open(decoded_path) as img:
                img_data['width'] = img.width
                img_data['height'] = img.height
                exif_data = img._getexif()
                if exif_data:
                    exif = { ExifTags.TAGS[k]: v for k, v in exif_data.items() if k in ExifTags.TAGS }
                    img_data['model'] = exif.get('Model', 'N/A')
                    
                    gps_info = exif.get('GPSInfo')
                    if gps_info:
                        # (GPS processing logic remains the same)
                        def to_degrees(c):
                            def convert_val(val):
                                if hasattr(val, 'numerator') and hasattr(val, 'denominator'):
                                    return float(val.numerator) / float(val.denominator)
                                return float(val)
                            return convert_val(c[0]) + convert_val(c[1]) / 60 + convert_val(c[2]) / 3600
                        
                        lat_ref, lat_val = gps_info.get(1), gps_info.get(2, None)
                        lon_ref, lon_val = gps_info.get(3), gps_info.get(4, None)

                        if lat_val is None or lon_val is None:
                            img_data['location'] = 'Incomplete GPS Data'
                            return jsonify(img_data)

                        lat = to_degrees(lat_val)
                        if lat_ref == 'S': lat = -lat

                        lon = to_degrees(lon_val)
                        if lon_ref == 'W': lon = -lon

                        cache_key = f"{lat:.5f},{lon:.5f}"
                        if cache_key in GEO_CACHE:
                            img_data['location'] = GEO_CACHE[cache_key]
                        else:
                            try:
                                from geopy.geocoders import Nominatim
                                geolocator = Nominatim(user_agent="photorium_app")
                                location = geolocator.reverse((lat, lon), language='ko', timeout=5)
                                address = location.address if location else 'Location not found'
                                GEO_CACHE[cache_key] = address
                                img_data['location'] = address
                            except Exception:
                                img_data['location'] = 'GPS data available' # Geocoding failed
                    else:
                        img_data['location'] = 'No GPS Data'
    except Exception:
        # If even opening the image fails, we return the default N/A values
        pass
    return jsonify(img_data)

@app.route('/api/exif/<encoded_path>')
def get_exif(encoded_path):
    """Returns all available EXIF data for an image."""
    try:
        decoded_path = base64.urlsafe_b64decode(encoded_path).decode()
        with Image.open(decoded_path) as img:
            exif_data = img._getexif()
            if not exif_data:
                return jsonify({'message': 'No EXIF data found.'})

            decoded_exif = {}
            for k, v in exif_data.items():
                tag_name = ExifTags.TAGS.get(k, k)
                # Decode bytes to string if possible
                if isinstance(v, bytes):
                    try:
                        v = v.decode(errors='ignore').strip('\x00')
                    except:
                        v = repr(v)
                # Convert non-serializable types to string
                if not isinstance(v, (str, int, float, bool, type(None))):
                    v = str(v)
                decoded_exif[str(tag_name)] = v
            
            return jsonify(decoded_exif)
    except Exception as e:
        return jsonify({'error': f'Could not read EXIF data: {str(e)}'}), 500

@app.route('/api/thumbnail/<encoded_path>')
def serve_thumbnail(encoded_path):
    """Generates and serves a small thumbnail for a given image path."""
    try:
        decoded_path = base64.urlsafe_b64decode(encoded_path).decode()
        if not os.path.exists(decoded_path):
            return "File not found", 404

        img = None
        VIDEO_EXTS = ('.mp4', '.webm', '.mov', '.avi', '.mkv')

        if decoded_path.lower().endswith(VIDEO_EXTS):
            cap = cv2.VideoCapture(decoded_path)
            if cap.isOpened():
                ret, frame = cap.read()
                if ret:
                    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    img = Image.fromarray(frame_rgb)
                cap.release()
        else:
            # For images, open and apply EXIF orientation correction
            img_raw = Image.open(decoded_path)
            img = ImageOps.exif_transpose(img_raw)

        if img:
            img.thumbnail((500, 500)) # Preserves aspect ratio
            img_io = io.BytesIO()
            
            # Convert to RGB if it has transparency to save as JPEG
            if img.mode in ('RGBA', 'P'):
                img = img.convert('RGB')

            img.save(img_io, 'JPEG', quality=80)
            img_io.seek(0)
            return send_file(img_io, mimetype='image/jpeg')
    except Exception as e:
        return "Could not generate thumbnail", 500

if __name__ == '__main__':
    from waitress import serve
    serve(app, host='127.0.0.1', port=5000)
