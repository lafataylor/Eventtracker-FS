from rest_framework.serializers import ModelSerializer, SerializerMethodField

from .models import Event, Venue, Account, Execution, Feedback


class EventSerializer(ModelSerializer):
    venue = SerializerMethodField()
    poster = SerializerMethodField()

    class Meta:
        model = Event
        exclude = ['exec']

    def get_venue(self, obj):
        _venue = VenueSerializer(obj.venue, many=False).data
        return _venue

    def get_poster(self, obj):
        _poster = AccountSerializer(obj.poster, many=False).data
        return _poster


class VenueSerializer(ModelSerializer):
    class Meta:
        model = Venue
        fields = "__all__"


class AccountSerializer(ModelSerializer):
    class Meta:
        model = Account
        exclude = ['created_by']


class ExecutionSerializer(ModelSerializer):
    class Meta:
        model = Execution
        fields = ["id", "status", "timestamp"]


class FeedbackSerializer(ModelSerializer):
    class Meta:
        model = Feedback
        fields = "__all__"
