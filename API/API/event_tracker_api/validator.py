class Validator:
    def is_missing(self, request_data: list):
        for value in request_data:
            if not value:
                return True
        
        return False

    def is_valid(self, request_data: list):
        for param in request_data:
            provided_value = param[0]
            excpected_type = param[1]
            if not type(provided_value) == excpected_type :
                return False
        
        return True