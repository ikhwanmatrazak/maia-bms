import sys
import os
sys.path.insert(0, os.getcwd())
try:
    from app.config import Settings
    from pydantic import ValidationError
    try:
        s = Settings()
        print("Success: Settings loaded")
    except ValidationError as e:
        print("MISSING_FIELDS:")
        for error in e.errors():
            print(f" - {error['loc'][0]} ({error['type']})")
    except Exception as e:
        print(f"Other Error: {e}")
except ImportError as e:
    print(f"Import Error: {e}")
