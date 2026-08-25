from rest_framework import serializers
from rest_framework.serializers import ModelSerializer
from .models import Account, Logs, Keywords, UserFeedback, GeocodingCache, AccountDetail


class AccountSerializer(ModelSerializer):
    class Meta:
        model = Account
        fields = ["id", "is_personal", "created_at", "user", "forLocation"]

class LogsSerializer(ModelSerializer):
    class Meta:
        model = Logs
        fields = '__all__'
        
class KeywordsSerializer(ModelSerializer):
    class Meta:
        model = Keywords
        fields = '__all__'

class UserFeedbackSerializer(ModelSerializer):
    class Meta:
        model = UserFeedback
        fields = '__all__'

class GeocodingCacheSerializer(ModelSerializer):
    class Meta:
        model = GeocodingCache
        fields = '__all__'

class AccountDetailSerializer(ModelSerializer):
    account_username = serializers.SerializerMethodField()

    class Meta:
        model = AccountDetail
        fields = ['id', 'account', 'account_username', 'field_name', 'value', 'mode', 'created_at', 'updated_at']

    def get_account_username(self, obj):
        return obj.account.user if obj.account else None

