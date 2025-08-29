# app/api/deps.py
from fastapi import Depends, HTTPException, Request

def require_user_id(request: Request) -> int:
    uid = request.session.get("user_id")
    if not uid:
        raise HTTPException(status_code=401, detail="not authenticated")
    return uid
