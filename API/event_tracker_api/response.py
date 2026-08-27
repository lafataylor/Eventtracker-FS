from rest_framework.response import Response
from rest_framework.status import HTTP_403_FORBIDDEN, HTTP_400_BAD_REQUEST, HTTP_200_OK, HTTP_404_NOT_FOUND
from django.http import JsonResponse


class InvalidToken(JsonResponse):
    STATUS = "error"
    MESSAGE = "Invalid ID Token"
    STATUS_CODE = HTTP_403_FORBIDDEN

    def __init__(self) -> None:
        self.data = {
            "status": self.STATUS,
            "message": self.MESSAGE
        }
        super().__init__(data=self.data, status=self.STATUS_CODE)


class MissingInformation(Response):
    STATUS = "error"
    MESSAGE = "Missing Information"
    STATUS_CODE = HTTP_400_BAD_REQUEST

    def __init__(self):
        self.data = {
            "status": self.STATUS,
            "message": self.MESSAGE
        }
        super().__init__(self.data, self.STATUS_CODE, template_name=None,
                         headers=None, exception=None, content_type=None)


class InvalidParameters(Response):
    STATUS = "error"
    MESSAGE = "Invalid Parameters"
    STATUS_CODE = HTTP_400_BAD_REQUEST

    def __init__(self):
        self.data = {
            "status": self.STATUS,
            "message": self.MESSAGE
        }
        super().__init__(self.data, self.STATUS_CODE, template_name=None,
                         headers=None, exception=None, content_type=None)


class ServerProcessingError(Response):
    STATUS = "failure"
    MESSAGE = "Server Processing Error " 
    STATUS_CODE = HTTP_403_FORBIDDEN

    def __init__(self,message=""):
        self.data = {
            "status": self.STATUS,
            "message": f"{self.MESSAGE}  {str(message)}"
        }
        super().__init__(self.data, self.STATUS_CODE, template_name=None,
                         headers=None, exception=None, content_type=None)


class Success(Response):
    STATUS = "success"
    STATUS_CODE = HTTP_200_OK

    def __init__(self, data=None, status=False):
        self.data = {"status": self.STATUS} if (not data and data != []) else (
            {"status": self.STATUS, "data": data} if status else data)
        super().__init__(self.data, self.STATUS_CODE, template_name=None,
                         headers=None, exception=None, content_type=None)


class UserNotFound(Response):
    STATUS = "error"
    MESSAGE = "User not found!"
    STATUS_CODE = HTTP_404_NOT_FOUND

    def __init__(self):
        self.data = {
            "status": self.STATUS,
            "message": self.MESSAGE
        }
        super().__init__(self.data, self.STATUS_CODE, template_name=None,
                         headers=None, exception=None, content_type=None)


class EventNotFound(Response):
    STATUS = "error"
    MESSAGE = "Event not found!"
    STATUS_CODE = HTTP_404_NOT_FOUND

    def __init__(self):
        self.data = {
            "status": self.STATUS,
            "message": self.MESSAGE
        }
        super().__init__(self.data, self.STATUS_CODE, template_name=None,
                         headers=None, exception=None, content_type=None)


class IncorrectPassword(Response):
    STATUS = "error"
    MESSAGE = "Incorrect password!"
    STATUS_CODE = HTTP_403_FORBIDDEN

    def __init__(self):
        self.data = {
            "status": self.STATUS,
            "message": self.MESSAGE
        }
        super().__init__(self.data, self.STATUS_CODE, template_name=None,
                         headers=None, exception=None, content_type=None)


class TestResponse(Response):
    STATUS = "test"
    MESSAGE = "test executed"
    STATUS_CODE = HTTP_200_OK

    def __init__(self):
        self.data = {
            "status": self.STATUS,
            "message": self.MESSAGE
        }
        super().__init__(self.data, self.STATUS_CODE, template_name=None,
                         headers=None, exception=None, content_type=None)


class DebugResponse(Response):
    STATUS = "400"
    MESSAGE = "test executed"
    STATUS_CODE = HTTP_400_BAD_REQUEST

    def __init__(self, message):
        self.data = {
            "status": self.STATUS,
            "message": message
        }
        super().__init__(self.data, self.STATUS_CODE, template_name=None,
                         headers=None, exception=None, content_type=None)
