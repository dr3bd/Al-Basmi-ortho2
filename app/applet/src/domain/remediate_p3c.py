with open('src/domain/p3cExaminationService.ts', 'r', encoding='utf-8') as f:
    text = f.read()

keywords = [
    "finding_name",
    "finding_status",
    "Quantitative_value",
    "tooth_number_fdi",
    "numbering_system",
    "severity: 'MODERATE'",
    "Space_required",
    "space_available",
    "discrepancy"
]

new_lines = []
for line in text.splitlines():
    if any(k in line for k in keywords):
        continue
    new_lines.append(line)

text = "\n".join(new_lines)
text = text.replace("operation_type: 'SOFT_DELETE'", "operation_type: 'DELETE'")
text = text.replace("operation_type: 'INSERT'", "operation_type: 'CREATE'")

with open('src/domain/p3cExaminationService.ts', 'w', encoding='utf-8') as f:
    f.write(text)

print("Direct line filtering completed.")
