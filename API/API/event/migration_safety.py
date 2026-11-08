"""Decide whether a Django migration file may go out with autodeploy.

Opt in (AUTO_APPLY = True) is not enough: every operation must be one
the old code can keep serving if we put it back — extra nullable column,
new index, or empty new table. Anything that rebuilds a table, drops a
column, or runs Python/SQL stops.

Stdlib only so autodeploy.sh can classify a file from `git show` before
the new tree is on disk. 2026-11-07.
"""
import ast
import sys


ALLOWED_OPS = frozenset({'AddField', 'AddIndex', 'CreateModel'})


def classify_source(text):
    """Return (ok, reason). ok is True only when auto-apply is safe."""
    if not text or not str(text).strip():
        return False, 'empty migration file'
    try:
        tree = ast.parse(text)
    except SyntaxError as exc:
        return False, 'could not parse migration: %s' % exc

    migration = None
    for node in tree.body:
        if isinstance(node, ast.ClassDef) and node.name == 'Migration':
            migration = node
            break
    if migration is None:
        return False, 'no Migration class'

    if not _auto_apply_true(migration):
        return False, 'not marked AUTO_APPLY = True'

    ops = _operations(migration)
    if not ops:
        return False, 'AUTO_APPLY migration has no operations'

    for op in ops:
        name = _call_name(op)
        if name is None:
            return False, 'could not read an operation'
        if name not in ALLOWED_OPS:
            return False, '%s is not auto-applyable' % name
        if name == 'AddField' and not _addfield_nullable(op):
            return False, 'AddField must be null=True (SQLite otherwise rebuilds the table)'
    return True, 'auto-apply'


def _auto_apply_true(cls):
    for node in cls.body:
        if not isinstance(node, ast.Assign):
            continue
        for target in node.targets:
            if isinstance(target, ast.Name) and target.id == 'AUTO_APPLY':
                return isinstance(node.value, ast.Constant) and node.value.value is True
    return False


def _operations(cls):
    for node in cls.body:
        if not isinstance(node, ast.Assign):
            continue
        for target in node.targets:
            if isinstance(target, ast.Name) and target.id == 'operations':
                if isinstance(node.value, ast.List):
                    return list(node.value.elts)
                return []
    return []


def _call_name(node):
    if not isinstance(node, ast.Call):
        return None
    func = node.func
    if isinstance(func, ast.Attribute):
        return func.attr
    if isinstance(func, ast.Name):
        return func.id
    return None


def _addfield_nullable(call):
    field = None
    for kw in call.keywords:
        if kw.arg == 'field':
            field = kw.value
            break
    if field is None and len(call.args) >= 3:
        field = call.args[2]
    if not isinstance(field, ast.Call):
        return False
    for kw in field.keywords:
        if kw.arg == 'null' and isinstance(kw.value, ast.Constant) and kw.value.value is True:
            return True
    return False


def main(argv=None):
    text = sys.stdin.read()
    ok, reason = classify_source(text)
    sys.stdout.write(reason + '\n')
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
