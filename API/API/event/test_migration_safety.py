"""AUTO_APPLY plus a strict operation allowlist: only additive schema.

A generated migration must not go live just because it looks small. The
file has to opt in (AUTO_APPLY = True) AND every operation must be one
we can reverse by putting the old code back (extra nullable column or
index; old readers ignore both).
"""
from pathlib import Path

from django.test import SimpleTestCase

from event.migration_safety import classify_source


HERE = Path(__file__).resolve().parent
MIGRATIONS = HERE / 'migrations'

AUTO_ADDFIELD = '''
from django.db import migrations, models

class Migration(migrations.Migration):
    AUTO_APPLY = True
    dependencies = [("event", "0011_event_start_date_index")]
    operations = [
        migrations.AddField(
            model_name="event",
            name="image_dhash",
            field=models.CharField(blank=True, max_length=16, null=True),
        ),
    ]
'''

AUTO_ADDINDEX = '''
from django.db import migrations, models

class Migration(migrations.Migration):
    AUTO_APPLY = True
    dependencies = [("event", "0010_backfill_shortcode")]
    operations = [
        migrations.AddIndex(
            model_name="event",
            index=models.Index(fields=["start_date"], name="event_start_date_idx"),
        ),
    ]
'''

NOT_NULL_ADDFIELD = '''
from django.db import migrations, models

class Migration(migrations.Migration):
    AUTO_APPLY = True
    operations = [
        migrations.AddField(
            model_name="event",
            name="must_have",
            field=models.CharField(max_length=16, default="x"),
        ),
    ]
'''

REMOVEFIELD = '''
from django.db import migrations

class Migration(migrations.Migration):
    AUTO_APPLY = True
    operations = [
        migrations.RemoveField(model_name="event", name="image_dhash"),
    ]
'''

RUNPYTHON = '''
from django.db import migrations

def fill(apps, schema_editor):
    pass

class Migration(migrations.Migration):
    AUTO_APPLY = True
    operations = [migrations.RunPython(fill)]
'''

UNMARKED_ADDFIELD = '''
from django.db import migrations, models

class Migration(migrations.Migration):
    operations = [
        migrations.AddField(
            model_name="event",
            name="image_dhash",
            field=models.CharField(max_length=16, null=True),
        ),
    ]
'''

AUTO_FALSE = '''
from django.db import migrations, models

class Migration(migrations.Migration):
    AUTO_APPLY = False
    operations = [
        migrations.AddField(
            model_name="event",
            name="image_dhash",
            field=models.CharField(max_length=16, null=True),
        ),
    ]
'''

MIXED = '''
from django.db import migrations, models

class Migration(migrations.Migration):
    AUTO_APPLY = True
    operations = [
        migrations.AddField(
            model_name="event",
            name="image_dhash",
            field=models.CharField(max_length=16, null=True),
        ),
        migrations.RemoveField(model_name="event", name="price"),
    ]
'''


class ClassifySourceTests(SimpleTestCase):
    def test_nullable_addfield_with_opt_in_is_allowed(self):
        ok, reason = classify_source(AUTO_ADDFIELD)
        self.assertTrue(ok, reason)

    def test_addindex_with_opt_in_is_allowed(self):
        ok, reason = classify_source(AUTO_ADDINDEX)
        self.assertTrue(ok, reason)

    def test_unmarked_addfield_is_blocked(self):
        ok, reason = classify_source(UNMARKED_ADDFIELD)
        self.assertFalse(ok)
        self.assertIn('AUTO_APPLY', reason)

    def test_explicit_false_is_blocked(self):
        ok, reason = classify_source(AUTO_FALSE)
        self.assertFalse(ok)

    def test_not_null_addfield_is_blocked_even_when_marked(self):
        ok, reason = classify_source(NOT_NULL_ADDFIELD)
        self.assertFalse(ok)
        self.assertIn('null', reason.lower())

    def test_removefield_is_blocked_even_when_marked(self):
        ok, reason = classify_source(REMOVEFIELD)
        self.assertFalse(ok)
        self.assertIn('RemoveField', reason)

    def test_runpython_is_blocked_even_when_marked(self):
        ok, reason = classify_source(RUNPYTHON)
        self.assertFalse(ok)
        self.assertIn('RunPython', reason)

    def test_one_risky_op_blocks_the_whole_file(self):
        ok, reason = classify_source(MIXED)
        self.assertFalse(ok)
        self.assertIn('RemoveField', reason)

    def test_live_0011_is_not_auto_apply(self):
        # Editing an old unmarked file must stay a hard stop. 0011 already
        # shipped; it is the template for "additive but not opted in".
        text = (MIGRATIONS / '0011_event_start_date_index.py').read_text()
        ok, reason = classify_source(text)
        self.assertFalse(ok)
        self.assertIn('AUTO_APPLY', reason)
