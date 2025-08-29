# app/api/auth.py
from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse, JSONResponse
from sqlmodel import Session, select
from ..db.core import get_session
from ..db.models import User, GoogleAccount
from ..services.google_oauth import oauth

router = APIRouter()

@router.get("/google/init")
async def google_init(request: Request):
    return await oauth.google.authorize_redirect(
        request,
        request.app.state.oauth_redirect,
        access_type="offline",
        prompt="consent",
        include_granted_scopes="true",
    )

@router.get("/google/callback")
async def google_callback(request: Request, session: Session = Depends(get_session)):
    if (err := request.query_params.get("error")):
        return RedirectResponse(url=f"/?oauth_error={err}", status_code=307)

    token = await oauth.google.authorize_access_token(request)

    # Log: helps when debugging
    print("OAUTH TOKEN KEYS:", list(token.keys()))
    print("OAUTH RAW TOKEN:", token)

    # userinfo (prefer token['userinfo'], then id_token, then endpoint)
    userinfo = token.get("userinfo")
    if not userinfo:
        try:
            userinfo = await oauth.google.parse_id_token(request, token)
        except Exception:
            userinfo = None
    if not userinfo:
        resp = await oauth.google.get("https://openidconnect.googleapis.com/v1/userinfo", token=token)
        try:
            userinfo = resp.json()
        except Exception:
            userinfo = None

    email = (userinfo or {}).get("email", "").lower()
    if not email:
        return JSONResponse({"detail": "no email in userinfo/id_token"}, status_code=400)

    # upsert user
    user = session.exec(select(User).where(User.email == email)).first()
    if not user:
        user = User(email=email)
        session.add(user)
        session.commit()
        session.refresh(user)

    # keep session
    request.session["user_id"] = user.id

    # upsert GoogleAccount
    refresh_token = token.get("refresh_token")
    access_token  = token.get("access_token")
    id_token      = token.get("id_token")

    ga = session.exec(select(GoogleAccount).where(GoogleAccount.user_id == user.id)).first()
    if not ga:
        ga = GoogleAccount(user_id=user.id)
        session.add(ga)

    # IMPORTANT: your model does not have 'refresh_token'; write to the field it has
    if refresh_token:
        if hasattr(ga, "refresh_token"):
            ga.refresh_token = refresh_token
        elif hasattr(ga, "refresh_token_enc"):
            ga.refresh_token_enc = refresh_token
        else:
            # last resort: show fields so we know what to map
            raise RuntimeError(f"GoogleAccount model has no refresh_token field. Fields={ga.__fields__.keys()}")

    if access_token and hasattr(ga, "access_token"):
        ga.access_token = access_token

    if hasattr(ga, "email"):
        ga.email = email
    if id_token and hasattr(ga, "id_token"):
        ga.id_token = id_token

    ga.status = "ok"
    session.commit()

    # sanity log
    g2 = session.exec(select(GoogleAccount).where(GoogleAccount.user_id == user.id)).first()
    print("DB AFTER SAVE:", {
        "has_refresh_token": bool(getattr(g2, "refresh_token", None) or getattr(g2, "refresh_token_enc", None)),
        "has_access_token": bool(getattr(g2, "access_token", None)),
        "fields": [f for f in ("refresh_token", "refresh_token_enc", "access_token") if hasattr(g2, f)],
        "status": getattr(g2, "status", None),
    })

    return RedirectResponse(url="/auth/connected", status_code=307)

@router.get("/connected")
def connected(request: Request):
    return {"ok": True, "user_id": request.session.get("user_id")}

# Optional debug
@router.get("/me/google")
def me_google(request: Request, session: Session = Depends(get_session)):
    user_id = request.session.get("user_id")
    if not user_id:
        return JSONResponse({"ok": False, "reason": "no session"}, status_code=401)
    ga = session.exec(select(GoogleAccount).where(GoogleAccount.user_id == user_id)).first()
    if not ga:
        return {"ok": False, "reason": "no googleaccount row for user", "user_id": user_id}
    return {
        "ok": True,
        "user_id": user_id,
        "google_account_id": getattr(ga, "id", None),
        "has_access_token": bool(getattr(ga, "access_token", None)),
        "has_refresh_token": bool(getattr(ga, "refresh_token", None) or getattr(ga, "refresh_token_enc", None)),
        "raw_fields_present": [f for f in ("refresh_token", "refresh_token_enc", "access_token") if hasattr(ga, f)],
        "status": getattr(ga, "status", None),
    }
