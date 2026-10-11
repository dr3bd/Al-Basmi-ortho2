import re

def fix_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        text = f.read()

    # Wrap audit_logs.set object literals with as any
    text = re.sub(
        r'(audit_logs\.set\([^,\s]+,\s*)(\{[\s\S]*?\})(\);)',
        lambda m: m.group(1) + '(' + m.group(2) + ') as any);',
        text
    )

    # Wrap sync_operations.set object literals with as any
    text = re.sub(
        r'(sync_operations\.set\([^,\s]+,\s*)(\{[\s\S]*?\})(\);)',
        lambda m: m.group(1) + '(' + m.group(2) + ') as any);',
        text
    )

    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)

fix_file('src/domain/p3cExaminationService.ts')
fix_file('src/domain/p3ClinicalCoreService.ts')
print("Fixed audit and sync sets across p3c and p3ClinicalCore.")
