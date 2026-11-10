-- Deneme verisini (10 örnek arkadaş, onların tahminleri, puanları, arkadaşlıkları, kurdukları gruplar ve mesajları) siler.
-- Örnek profillerin anahtarı 'seed:' ile başlar; bağlı kayıtlar profille birlikte silinir (on delete cascade).
-- TT (tugrultale@gmail.com) profilinde kalanlar: kurduğu "Cimbom Tayfa" grubu ve örnek maçlardaki kendi tahminleri.
delete from profiles where secret_hash like 'seed:%';
delete from groups where name = 'Cimbom Tayfa' and owner = 'f04d9dc2-bb11-4d96-ace2-86abc6623de0';
delete from points where profile_id = 'f04d9dc2-bb11-4d96-ace2-86abc6623de0' and match_id in
  (1584424,1584428,1584434,1584435,1584442,1584451,1584455,1584459,1584461,1635620,1635658,1635661,1635666,1635669,1635684);
delete from picks where profile_id = 'f04d9dc2-bb11-4d96-ace2-86abc6623de0' and match_id in
  (1584424,1584428,1584434,1584435,1584442,1584451,1584455,1584459,1584461,1635620,1635658,1635661,1635666,1635669,1635684);
