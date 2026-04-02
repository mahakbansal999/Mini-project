db = db.getSiblingDB('admin');
db.createUser({
    user: "admin",
    pwd: "password",
    roles: [{ role: "root", db: "admin" }]
});

db = db.getSiblingDB('throttling');
db.createCollection('usagepatterns');
db.createCollection('capacitymetrics');
