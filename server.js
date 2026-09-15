const express = require('express');
const cookieSession = require('cookie-session');
const { Pool } = require('pg');
const path = require('path');
const app = express();
const PORT = Number(process.env.PORT || 3000);
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'change-this-password';
const COOKIE_SECRET = process.env.COOKIE_SECRET || 'change-this-cookie-secret';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost') ? { rejectUnauthorized: false } : false });
async function initDb(){ await pool.query(`CREATE TABLE IF NOT EXISTS offers(id SERIAL PRIMARY KEY,name TEXT NOT NULL,icon TEXT DEFAULT '🎁',type TEXT DEFAULT 'Lead',description TEXT DEFAULT '',url TEXT NOT NULL,countries JSONB NOT NULL,active BOOLEAN DEFAULT TRUE,created_at TIMESTAMPTZ DEFAULT NOW())`); }
app.set('trust proxy',1); app.use(express.json({limit:'100kb'})); app.use(express.urlencoded({extended:true})); app.use(cookieSession({name:'offerhub_session',keys:[COOKIE_SECRET],httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:86400000})); app.use(express.static(path.join(__dirname,'public')));
function auth(req,res,next){if(req.session?.admin===true)return next();return res.status(401).json({error:'Unauthorized'});}
function validUrl(v){try{return ['http:','https:'].includes(new URL(v).protocol)}catch{return false}}
function cleanCountries(v){const a=Array.isArray(v)?v:String(v||'').split(',');return [...new Set(a.map(x=>String(x).trim().toUpperCase()).filter(Boolean))]}
function parseOffer(r){return {...r,countries:Array.isArray(r.countries)?r.countries:[]}}
app.post('/api/login',(req,res)=>{const {username,password}=req.body||{};if(username===ADMIN_USER&&password===ADMIN_PASS){req.session.admin=true;return res.json({ok:true})}res.status(401).json({error:'Invalid credentials'})});
app.post('/api/logout',auth,(req,res)=>{req.session=null;res.json({ok:true})});
app.get('/api/me',(req,res)=>res.json({authenticated:!!req.session?.admin}));
app.get('/api/offers',async(req,res)=>{try{const c=String(req.query.country||'').trim().toUpperCase();const {rows}=await pool.query('SELECT * FROM offers WHERE active=TRUE ORDER BY id DESC');res.json(rows.filter(o=>!c||o.countries.includes('GLOBAL')||o.countries.includes(c)).map(parseOffer))}catch(e){res.status(500).json({error:'Failed to load offers'})}});
app.get('/api/admin/offers',auth,async(req,res)=>{try{const {rows}=await pool.query('SELECT * FROM offers ORDER BY id DESC');res.json(rows.map(parseOffer))}catch(e){res.status(500).json({error:'Failed to load offers'})}});
app.post('/api/admin/offers',auth,async(req,res)=>{const {name,icon,type,description,url,countries,active}=req.body||{};const cs=cleanCountries(countries);if(!name||!url||!cs.length||!validUrl(url))return res.status(400).json({error:'Name, valid URL and at least one country are required.'});try{const {rows}=await pool.query('INSERT INTO offers(name,icon,type,description,url,countries,active) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7) RETURNING id',[String(name).trim(),String(icon||'🎁').slice(0,8),type||'Lead',String(description||'').trim(),url.trim(),JSON.stringify(cs),active!==false]);res.json({id:rows[0].id})}catch(e){res.status(500).json({error:'Failed to create offer'})}});
app.put('/api/admin/offers/:id',auth,async(req,res)=>{try{const f=await pool.query('SELECT * FROM offers WHERE id=$1',[req.params.id]);if(!f.rows[0])return res.status(404).json({error:'Not found'});const x={...parseOffer(f.rows[0]),...req.body},cs=cleanCountries(x.countries);if(!x.name||!validUrl(x.url)||!cs.length)return res.status(400).json({error:'Invalid offer data.'});await pool.query('UPDATE offers SET name=$1,icon=$2,type=$3,description=$4,url=$5,countries=$6::jsonb,active=$7 WHERE id=$8',[String(x.name).trim(),String(x.icon||'🎁').slice(0,8),x.type||'Lead',String(x.description||'').trim(),String(x.url).trim(),JSON.stringify(cs),!!x.active,req.params.id]);res.json({ok:true})}catch(e){res.status(500).json({error:'Failed to update offer'})}});
app.delete('/api/admin/offers/:id',auth,async(req,res)=>{try{await pool.query('DELETE FROM offers WHERE id=$1',[req.params.id]);res.json({ok:true})}catch(e){res.status(500).json({error:'Failed to delete offer'})}});
app.get('/api/health',async(req,res)=>{try{await pool.query('SELECT 1');res.json({ok:true})}catch{res.status(503).json({ok:false})}});
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
initDb().then(()=>app.listen(PORT,()=>console.log(`OfferHub running on port ${PORT}`))).catch(e=>{console.error(e);process.exit(1)});
