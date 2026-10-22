const canvas = document.getElementById("content-canvas");
const image = new Image();
image.onload = () => canvas.getContext("2d").drawImage(image, 0, 0);
image.src = "/media.svg";
document.getElementById("add-media").onclick = () => {
  const picture = document.createElement("picture");
  const img = document.createElement("img");
  img.id = "dynamic-media";
  img.alt = "动态照片";
  img.src = "/media.svg";
  picture.append(img);
  document.querySelector("main").append(picture);
};
document.getElementById("dialog-open").onclick = () => document.getElementById("dialog").showModal();
document.getElementById("dialog-close").onclick = () => document.getElementById("dialog").close();
document.getElementById("screen-open").onclick = () => document.getElementById("screen").requestFullscreen();
document.getElementById("video-open").onclick = () => document.getElementById("content-video").requestFullscreen();
