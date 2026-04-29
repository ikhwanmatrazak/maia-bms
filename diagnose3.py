import paramiko, sys
sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('20.204.18.22', username='ikhwanmr', password='ikhwanmr@123', timeout=15)

fe = 'compose-parse-auxiliary-capacitor-8v6hsz-frontend-1'
be = 'compose-parse-auxiliary-capacitor-8v6hsz-backend-1'

# 1. Get a real token and call the projects API
print("=== Login and call /api/v1/projects ===")
script = """
import pymysql, json, datetime

conn = pymysql.connect(host='mariadb-reboot-cross-platform-circuit-noxxkg',
    user='root', password='h4KXS9G@1234', database='bms')
cur = conn.cursor(pymysql.cursors.DictCursor)

cur.execute(\"\"\"
    SELECT p.id, p.name, p.priority, p.client_id, p.stage_id,
           p.start_date, p.end_date, p.budget, p.created_by, p.created_at,
           s.name AS stage_name, s.color AS stage_color,
           c.company_name AS client_name,
           (SELECT COUNT(*) FROM project_members m WHERE m.project_id=p.id) AS member_count,
           (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id=p.id) AS task_count,
           (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id=p.id AND t.status='done') AS done_count
    FROM projects p
    LEFT JOIN project_stages s ON s.id=p.stage_id
    LEFT JOIN clients c ON c.id=p.client_id
    WHERE p.tenant_id=1
\"\"\")
rows = cur.fetchall()
print(f"Total projects: {len(rows)}")
for r in rows:
    # Simulate what _proj_row does
    for k, v in r.items():
        if isinstance(v, (datetime.date, datetime.datetime)):
            r[k] = str(v)
    print(json.dumps(r, default=str))
conn.close()
"""

sftp = ssh.open_sftp()
with sftp.file('/tmp/d3.py', 'w') as f:
    f.write(script)
sftp.close()

_, o, e = ssh.exec_command(f'docker cp /tmp/d3.py {be}:/tmp/d3.py && docker exec {be} python3 /tmp/d3.py')
print(o.read().decode('utf-8','replace'))
err = e.read().decode('utf-8','replace')
if err.strip():
    print("STDERR:", err[:300])

# 2. Check if projects/[id]/page.tsx is the issue - check if it exists and what it imports
print("\n=== projects/[id] page compiled? ===")
_, o, _ = ssh.exec_command('docker exec ' + fe + ' ls /app/.next/server/app/\\(dashboard\\)/projects/ 2>/dev/null')
print(o.read().decode('utf-8','replace').strip())

# 3. Check Next.js error in the page route specifically
print("\n=== Next.js trace for projects route ===")
_, o, _ = ssh.exec_command('docker exec ' + fe + ' sh -c "node -e \\"const m=require(\'/app/.next/server/app/(dashboard)/projects/page.js\'); console.log(typeof m.default)\\" 2>&1"')
print(o.read().decode('utf-8','replace').strip())

# 4. Check layout
print("\n=== Dashboard layout compiled ===")
_, o, _ = ssh.exec_command('docker exec ' + fe + ' ls /app/.next/server/app/\\(dashboard\\)/ 2>/dev/null | head -10')
print(o.read().decode('utf-8','replace').strip())

ssh.close()
