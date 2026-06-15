import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from api.client import get

data = get('v2/users', {'limit': 100})
users = data.get('data', [])
print('Usuarios visiveis:', len(users))
for u in users:
    print(' -', u.get('name'), '|', u.get('email'))