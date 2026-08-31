#!/bin/bash
set -euo pipefail

root_dir="$(cd "$(dirname "$0")" && pwd)"
frame_dir="$root_dir/frames"
caption_file="$root_dir/captions/mission-control-promo.srt"
silent_video="$root_dir/mission-control-promo-picture.mp4"
music_file="$root_dir/audio/mission-control-ambient.m4a"
master_file="$root_dir/mission-control-promo-master.mp4"
final_file="$root_dir/mission-control-promo.mp4"

frames=(
  01-today-overview.png
  02-quick-capture.png
  03-inbox-process.png
  04-route-to-project.png
  05-area-workspace.png
  06-project-board.png
  07-project-list.png
  08-project-notes.png
  09-routines-and-waiting.png
  10-recurring-schedule.png
  11-block-execution.png
  12-choose-block-work.png
  13-weekly-review.png
  14-final-today.png
)

durations=(6 5 5 4 6 6 4 5 5 5 6 4 6 6)
transition=0.5
fps=30

input_args=()
filter=""

for index in "${!frames[@]}"; do
  duration="${durations[$index]}"
  frame_count=$((duration * fps))
  input_args+=(-loop 1 -t "$duration" -i "$frame_dir/${frames[$index]}")

  scene_filter="scale=2000:1125,zoompan=z='min(zoom+0.00012,1.02)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frame_count}:s=1920x1080:fps=${fps},trim=duration=${duration},setpts=PTS-STARTPTS"

  if [[ "$index" -eq 0 ]]; then
    scene_filter+=",drawbox=x=92:y=672:w=1110:h=250:color=0xf7f7f1@0.94:t=fill:enable='between(t,0,5.3)'"
    scene_filter+=",drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='MISSION CONTROL':fontcolor=0x183f34:fontsize=68:x=132:y=720:enable='between(t,0,5.3)'"
    scene_filter+=",drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='A calmer way to plan what matters.':fontcolor=0x34443e:fontsize=35:x=136:y=820:enable='between(t,0,5.3)'"
  fi

  if [[ "$index" -eq 13 ]]; then
    scene_filter+=",drawbox=x=92:y=734:w=1120:h=190:color=0xf7f7f1@0.94:t=fill"
    scene_filter+=",drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='PLAN LESS. EXECUTE WHAT MATTERS.':fontcolor=0x183f34:fontsize=44:x=132:y=786"
    scene_filter+=",drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='Mission Control':fontcolor=0x5f704f:fontsize=27:x=136:y=850"
  fi

  filter+="[$index:v]${scene_filter}[v$index];"
done

previous="v0"
cumulative="${durations[0]}"

for ((index=1; index<${#frames[@]}; index++)); do
  offset=$(awk -v cumulative="$cumulative" -v scene_index="$index" -v transition="$transition" 'BEGIN { printf "%.3f", cumulative - scene_index * transition }')
  output="x$index"
  filter+="[$previous][v$index]xfade=transition=fade:duration=$transition:offset=$offset[$output];"
  previous="$output"
  cumulative=$((cumulative + durations[index]))
done

filter="${filter%;}"

ffmpeg -y "${input_args[@]}" \
  -filter_complex "$filter" \
  -map "[$previous]" \
  -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -r "$fps" \
  -movflags +faststart "$silent_video"

total_duration=66.5
fade_out_start=63.5
music_expr="0.021*(sin(2*PI*130.81*t)+0.78*sin(2*PI*164.81*t)+0.62*sin(2*PI*196*t)+0.30*sin(2*PI*261.63*t))*(0.78+0.22*sin(2*PI*0.085*t))+0.010*sin(2*PI*392*t)*(0.5+0.5*sin(2*PI*0.19*t))"

ffmpeg -y -f lavfi \
  -i "aevalsrc=exprs='${music_expr}|${music_expr}':s=48000:d=${total_duration}" \
  -af "highpass=f=85,lowpass=f=1800,aecho=0.8:0.55:850|1350:0.12|0.08,afade=t=in:st=0:d=2,afade=t=out:st=${fade_out_start}:d=3,volume=7.2" \
  -c:a aac -b:a 192k "$music_file"

ffmpeg -y -i "$silent_video" -i "$music_file" \
  -map 0:v:0 -map 1:a:0 -c:v copy -c:a copy -shortest \
  -metadata title="Mission Control — Promotional Walkthrough" \
  -metadata comment="Original ambient score generated for this video." \
  -movflags +faststart "$master_file"

ffmpeg -y -i "$master_file" -i "$caption_file" \
  -map 0:v:0 -map 0:a:0 -map 1:0 \
  -c:v copy -c:a copy -c:s mov_text \
  -metadata:s:s:0 language=eng -metadata:s:s:0 title="English" \
  -disposition:s:0 default \
  -metadata title="Mission Control — Promotional Walkthrough" \
  -movflags +faststart "$final_file"

ffprobe -v error -show_entries format=duration,size:stream=index,codec_type,codec_name,width,height,r_frame_rate:stream_tags=language,title \
  -of json "$final_file"
