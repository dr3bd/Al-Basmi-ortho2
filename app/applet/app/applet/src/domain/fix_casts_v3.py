import re

with open('src/domain/p3cExaminationService.ts', 'r', encoding='utf-8') as f:
    text = f.read()

# We want to change:
# txDb.audit_logs.set(auditId, { ... });
# to:
# txDb.audit_logs.set(auditId, ({ ... }) as any);

def wrap_set_call(m):
    prefix = m.group(1) # e.g. txDb.audit_logs.set(auditId, 
    body = m.group(2)   # e.g. { ... }
    return prefix + "(" + body + ") as any);"

# Match audit_logs.set
text = re.sub(
    r'(txDb\.audit_logs\.set\(auditId,\s*)(\{[\s\S]*?\})(\);)',
    wrap_set_call,
    text
)

# Match sync_operations.set
text = re.sub(
    r'(txDb\.sync_operations\.set\(ctx\.operation_id,\s*)(\{[\s\S]*?\})(\);)',
    wrap_set_call,
    text
)

with open('src/domain/p3cExaminationService.ts', 'w', encoding='utf-8') as f:
    f.write(text)

print("Wrapped audit and sync sets with as any.")
