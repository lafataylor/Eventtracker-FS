from django.conf import settings
from c_auth.authentication import authenticate_jwt_token
from .response import InvalidToken


class CustomAuthenticationMiddleware:
    GENERAL_ENDPOINTS = [
        f"/{settings.API_VERSION}/" + endpoint for endpoint in [
            "documentation/",
            "auth/login/",
            "auth/register/",
            "auth/userLogin/",
            "auth/userRegister/",
            "auth/refreshToken/",
            "admin/feedback/",
            "event/",
            "event/user/",
            "event/date/",
            "event/date/range/",
            "event/filter/",
            "event/feedback/",
            "admin/system/logs/save/",
            "admin/execution/",
            "admin/runScraper",
            "event/search/",
            "event/locations/",
            "event/favorites/add/",
            "event/favorites/remove/",
            "event/favorites/",
            "admin/geocode/",
            "admin/geocode/stats/"
        ]
    ]

    def __init__(self, get_response):
        self.get_response = get_response

    def process_views(self, request):
        return True if not request.path in CustomAuthenticationMiddleware.GENERAL_ENDPOINTS else False

    def process_request(self, request):
        try:
            token = request.headers.get("Authorization")

            id_token = CustomAuthenticationMiddleware.get_token_id(token)

            authenticated = authenticate_jwt_token(id_token)
            if not authenticated:
                raise Exception()
        except:
            return False

        return True

    def __call__(self, request):
        authentication_required = self.process_views(request)

        if authentication_required:
            process_request = self.process_request(request)
            if not process_request:
                return InvalidToken()

        response = self.get_response(request)
        return response

    @staticmethod
    def get_token_id(token):
        token_id = token.replace("Token ", "").replace("Bearer ", "")
        return token_id
