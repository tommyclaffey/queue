#!/bin/bash
# usage: capall.sh screens.json prefix base W H theme [mobile]
node -e '
const s=require(process.argv[1]);for(const [id,name,js] of s) console.log(id+"\t"+Buffer.from("const w=(ms)=>new Promise(r=>setTimeout(r,ms)); "+js).toString("base64"));' "$1" | while IFS=$'\t' read -r id js; do
  node capture.mjs "$3" "cap/$2-$id.json" "$4" "$5" "$6" "$(echo "$js" | base64 -d)" "$7"
done
