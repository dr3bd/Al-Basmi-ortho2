import re

with open('src/domain/p3cExaminationService.ts', 'r', encoding='utf-8') as f:
    text = f.read()

text = re.sub(
    r'(txDb\.audit_logs\.set\(auditId,\s*\{)([\s\S]*?)(\});',
    r'\1\2} as any);',
    text
)

text = re.sub(
    r'(txDb\.sync_operations\.set\(ctx\.operation_id,\s*\{)([\s\S]*?)(\});',
    r'\1\2} as any);',
    text
)

with open('src/domain/p3cExaminationService.ts', 'w', encoding='utf-8') as f:
    f.write(text)

print("Object literal casts applied.")
