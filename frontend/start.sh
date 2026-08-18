#!/bin/bash
# Backend start karo
cd ~/Desktop/bisnoi/backend
source venv/bin/activate
python3 server.py &

# Frontend start karo
cd ~/Desktop/bisnoi
npx expo start --web &

echo "✅ Backend: http://localhost:8080"
echo "✅ Frontend: http://localhost:8081"
