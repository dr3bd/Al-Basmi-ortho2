import re

path = 'src/domain/p3cExaminationService.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Remove invalid fields from finding rows
content = re.sub(r'^\s*finding_name:.*$,?\n', '', content, flags=re.MULTILINE)
content = re.sub(r'^\s*finding_status:.*$,?\n', '', content, flags=re.MULTILINE)
content = re.sub(r'^\s*Quantitative_value:.*$,?\n', '', content, flags=re.MULTILINE)

# 2. Remove invalid fields from tooth finding rows
content = re.sub(r'^\s*tooth_number_fdi:.*$,?\n', '', content, flags=re.MULTILINE)
content = re.sub(r'^\s*numbering_system:.*$,?\n', '', content, flags=re.MULTILINE)
# Note: severity in tooth finding row: let's check if severity is allowed in SqliteToothFindingRow.
# SqliteToothFindingRow does NOT have severity. Let's remove severity: 'MODERATE', from tooth finding rows.
content = re.sub(r'^\s*severity:\s*\'MODERATE\',?\n', '', content, flags=re.MULTILINE)

# 3. Remove invalid fields from arch measurement rows
content = re.sub(r'^\s*Space_required:.*$,?\n', '', content, flags=re.MULTILINE)
content = re.sub(r'^\s*space_available:.*$,?\n', '', content, flags=re.MULTILINE)
content = re.sub(r'^\s*discrepancy:.*$,?\n', '', content, flags=re.MULTILINE)

# 4. Fix sync_operations operation_type: 'SOFT_DELETE' -> 'DELETE', 'INSERT' -> 'CREATE'
content = content.replace("operation_type: 'SOFT_DELETE'", "operation_type: 'DELETE'")
content = content.replace("operation_type: 'INSERT'", "operation_type: 'CREATE'")

# 5. Ensure audit logs have SqliteAuditLogRow properties (id, entity_type, entity_id, operation_type, user_id, device_id, timestamp, entity_version_before, entity_version_after, old_payload, new_payload, reason_code, metadata_json)
# Let's add explicit type casting or ensure properties exist or type as SqliteAuditLogRow & Record<string, any> and SqliteSyncOperationRow & Record<string, any>.
content = content.replace("const auditId = `aud-${ctx.operation_id}`;", "const auditId = `aud-${ctx.operation_id}`;\n    const auditRow: SqliteAuditLogRow & Record<string, any> =")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Remediation script executed.")
