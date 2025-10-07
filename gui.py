import tkinter as tk
from tkinter import scrolledtext, messagebox
import threading
import sys
import webbrowser
import logging
import os
import subprocess
from waitress import serve
from app import app

# --- Log Redirection ---
class TextRedirector:
    """A class to redirect stdout/stderr to a Tkinter Text widget."""
    def __init__(self, widget):
        self.widget = widget

    def write(self, str_):
        self.widget.configure(state='normal')
        self.widget.insert(tk.END, str_)
        self.widget.see(tk.END)
        self.widget.configure(state='disabled')

    def flush(self):
        pass

class NoQueueDepthFilter(logging.Filter):
    """A custom filter to exclude 'Task queue depth' warnings."""
    def filter(self, record):
        # Return False to prevent messages containing this string from being logged.
        return 'Task queue depth' not in record.getMessage()

# --- Server Control ---
server_thread = None

def run_server_thread(log_widget):
    """Runs the Waitress server in a separate thread."""
    # This function will now be simpler. We let Flask's default logging
    # (which goes to stderr, and thus our redirector) handle messages.
    # Waitress's own noisy logs are suppressed by not configuring a logger for it.
    try:
        serve(app, host='127.0.0.1', port=5000)
    except Exception as e:
        # This will be caught by the TextRedirector for stderr
        print(f"Server failed to start: {e}\n")

def start_server(log_widget):
    """Starts the server thread."""
    global server_thread
    if server_thread and server_thread.is_alive():
        log_widget.configure(state='normal')
        log_widget.insert(tk.END, "Server is already running.\n")
        log_widget.configure(state='disabled')
        return

    server_thread = threading.Thread(target=run_server_thread, args=(log_widget,), daemon=True)
    server_thread.start()
    log_widget.configure(state='normal')
    log_widget.insert(tk.END, "Photorium server started at http://127.0.0.1:5000\n")
    log_widget.configure(state='disabled')

def restart_server():
    """Restarts the entire application."""
    try:
        # Relaunch the application
        subprocess.Popen([sys.executable] + sys.argv)
        # Close the current instance
        sys.exit()
    except Exception as e:
        messagebox.showerror("Restart Failed", f"Could not restart the application:\n{e}")

def shutdown_app(root):
    """Stops the server and closes the application."""
    # This function is a placeholder for a more graceful shutdown.
    # For now, it just exits the process, which will terminate the daemon thread.
    if messagebox.askokcancel("Shutdown", "Are you sure you want to shut down the server?"):
        # A more graceful shutdown would involve signaling the server thread to stop.
        # For waitress, this is complex. A simpler robust solution is to exit.
        # The daemon thread will be terminated automatically.
        print("Shutting down server...")
        root.destroy()

def open_browser():
    """Opens the web browser to the application's URL."""
    webbrowser.open("http://127.0.0.1:5000")

def main():
    """Creates the main GUI window."""
    root = tk.Tk()
    root.title("Photorium Server Control")
    root.geometry("600x400")

    # --- Main Frame ---
    main_frame = tk.Frame(root, padx=10, pady=10)
    main_frame.pack(fill=tk.BOTH, expand=True)

    # --- Button Frame ---
    button_frame = tk.Frame(main_frame)
    button_frame.pack(fill=tk.X, pady=(0, 10))

    open_btn = tk.Button(button_frame, text="Open Photorium", command=open_browser)
    open_btn.pack(side=tk.LEFT, padx=(0, 10))

    restart_btn = tk.Button(button_frame, text="Restart Server", command=restart_server)
    restart_btn.pack(side=tk.LEFT, padx=(0, 10))

    shutdown_btn = tk.Button(button_frame, text="Shutdown Server", command=lambda: shutdown_app(root))
    shutdown_btn.pack(side=tk.LEFT)

    # --- Log Frame ---
    log_frame = tk.LabelFrame(main_frame, text="Server Log")
    log_frame.pack(fill=tk.BOTH, expand=True)

    log_text = scrolledtext.ScrolledText(log_frame, wrap=tk.WORD, state='disabled', bg="#f0f0f0")
    log_text.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

    # Redirect stdout and stderr to the log widget
    sys.stdout = TextRedirector(log_text)
    sys.stderr = TextRedirector(log_text)

    # --- Configure Flask Logging ---
    # Create a handler that writes to our redirected stdout
    handler = logging.StreamHandler(sys.stdout)
    # Set a format for the logs
    handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))

    # Configure the waitress logger to use our handler and filter
    waitress_logger = logging.getLogger('waitress')
    waitress_logger.setLevel(logging.INFO)
    waitress_logger.addHandler(handler)    # Also send waitress logs to our GUI
    waitress_logger.addFilter(NoQueueDepthFilter()) # Add the custom filter

    # Configure Flask's logger to use the same handler
    app.logger.setLevel(logging.DEBUG)
    app.logger.addHandler(handler)

    # Start the server automatically
    start_server(log_text)

    # Ensure the server thread is handled on exit
    root.protocol("WM_DELETE_WINDOW", lambda: shutdown_app(root))

    root.mainloop()

if __name__ == '__main__':
    main()