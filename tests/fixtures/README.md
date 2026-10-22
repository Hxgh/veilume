# 本地媒体样本

media.svg 与 media.webm 都是项目自行生成的纯色几何测试样本，不含外部素材。WebM 为 160×100、5fps、2 秒的 VP8 视频，用于验证真实视频解码帧，不只检查 poster。

生成命令（只在重建二进制 fixture 时需要 FFmpeg，运行测试和安装扩展不需要）：

```sh
ffmpeg -f lavfi -i 'color=c=0x6080a0:s=160x100:r=5:d=2,drawbox=x=80:y=0:w=80:h=100:color=white:t=fill,drawbox=x=0:y=50:w=80:h=50:color=black:t=fill' -c:v libvpx -crf 4 -b:v 100k -pix_fmt yuv420p -an media.webm
```
