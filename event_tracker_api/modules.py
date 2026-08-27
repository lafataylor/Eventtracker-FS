import os
import json
from django.conf import settings

def update_data_persistence_value(use:str, persistence_day_count: int, prompt:str):
    config_data = {
        "use": use,
        "persistence_day_count": persistence_day_count,
        "prompt": prompt
    }
    with open(settings.BASE_DIR / "config.json", "w+") as config:
        config.write(json.dumps(config_data))

def get_data_persistence_value():
    try:
        with open(settings.BASE_DIR / "config.json", "r") as config:
            config_data = json.loads(config.read())
    except:
        config_data = {}

    return config_data