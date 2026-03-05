import sys
import os
sys.path.insert(0, os.getcwd())
try:
    from app.middleware.auth import verify_password, hash_password
    
    # The hash from the database
    db_hash = "$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36Xm/7qDyk9q.L.TfGljT5O"
    password = "Admin@123"
    
    result = verify_password(password, db_hash)
    print(f"Verification result: {result}")
    
    new_hash = hash_password(password)
    print(f"Correct hash for '{password}': {new_hash}")
    
except Exception as e:
    print(f"Error: {e}")
