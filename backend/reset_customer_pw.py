"""Reset a customer-portal password to a known value."""
import sys
from src.core.db import SessionLocal
from src.models.customer_user import CustomerUser
from src.core.security import hash_password

EMAIL = sys.argv[1] if len(sys.argv) > 1 else "filimon2014@gmail.com"
PASSWORD = sys.argv[2] if len(sys.argv) > 2 else "Customer@1234"

db = SessionLocal()
u = db.query(CustomerUser).filter(CustomerUser.email == EMAIL).first()
if not u:
    print(f"No customer user with email {EMAIL}")
    sys.exit(1)
u.hashed_password = hash_password(PASSWORD)
u.is_active = True
u.token_version += 1
db.commit()
print(f"reset OK: {u.email}  customer_id={u.customer_id}  password={PASSWORD}")
db.close()
