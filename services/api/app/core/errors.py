from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class AppError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400):
        self.code = code
        self.message = message
        self.status_code = status_code


def error_response(code: str, message: str, status_code: int) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message, "details": {}}},
    )


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error_handler(_request: Request, error: AppError) -> JSONResponse:
        return error_response(error.code, error.message, error.status_code)

    @app.exception_handler(HTTPException)
    async def http_error_handler(
        _request: Request, error: HTTPException
    ) -> JSONResponse:
        return error_response(
            "http_error",
            str(error.detail),
            error.status_code,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        _request: Request, _error: RequestValidationError
    ) -> JSONResponse:
        return error_response("validation_error", "Invalid request.", 422)
