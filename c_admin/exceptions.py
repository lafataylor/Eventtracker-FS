REASON = "\nReason: {0}"

class SessionSaveError():
    message = "Session can not be saved"

    def __init__(self, exception):
        print(self.message, REASON.format(exception))


class LogsSaveError():
    message = "Logs can not be saved"

    def __init__(self, exception):
        print(self.message, REASON.format(exception))


class LoginError(Exception):
    message = "Unable to login"
    
    def __init__(self, exception):
        print(self.message, REASON.format(exception))


class ScrapingError(Exception):
    message = "Unable to scrape using apify"
    
    def __init__(self, exception):
        print(self.message, REASON.format(exception))

class NoAdminAccountError(Exception):
    message = "Unable to get admin accounts"
    
    def __init__(self, exception):
        print(self.message, REASON.format(exception))