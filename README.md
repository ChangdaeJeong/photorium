# Photorium

Photorium is a simple, self-hosted photo and video collection manager that runs locally on your machine.

## Features

- Add multiple folders to create your collections.
- View all media in a beautiful, date-sorted gallery.
- Get detailed metadata for your images, including location information.
- Customize the gallery grid size to your preference.
- ... and more!

## How to Run

### For Users

1.  Go to the [Releases](https://github.com/ChangdaeJeong/photorium/releases) page.
2.  Download the latest `Photorium.exe` file.
3.  Double-click the executable to start the server.
4.  Open your web browser and navigate to `http://127.0.0.1:5000`.

### For Developers

1.  Clone the repository: `git clone https://github.com/ChangdaeJeong/photorium.git`
2.  Create and activate a virtual environment: `python -m venv .venv` and `.venv\Scripts\activate`
3.  Install dependencies: `pip install -r requirements.txt`
4.  Run the Flask server: `python app.py`