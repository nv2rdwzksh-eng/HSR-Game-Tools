<template>
  <div class="warp-result-background" aria-hidden="true"><i /><i /><i /></div>
</template>
<style scoped>
.warp-result-background {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  background:
    radial-gradient(ellipse at 75% 30%, #2a34502b, transparent 60%),
    linear-gradient(
      180deg,
      var(--p-warp-result-top) 0%,
      var(--p-warp-result-upper) 40%,
      var(--p-warp-result-middle) 72%,
      var(--p-warp-result-lower) 92%,
      var(--p-warp-result-bottom) 100%
    );
}
.warp-result-background::before {
  content: '';
  position: absolute;
  inset: 0;
  opacity: 0.35;
  background-image:
    radial-gradient(circle at 12% 24%, #c8dcff 0 1px, transparent 2px),
    radial-gradient(circle at 67% 13%, #d6c68c 0 1px, transparent 2px),
    radial-gradient(circle at 86% 49%, #91b7ff 0 1px, transparent 2px),
    radial-gradient(circle at 35% 65%, #dceaff 0 1px, transparent 2px);
  background-size:
    370px 310px,
    510px 390px,
    650px 470px,
    770px 590px;
}
i {
  position: absolute;
  bottom: 0;
  left: 62%;
  width: 24px;
  height: 48%;
  opacity: 0.15;
  background: linear-gradient(0deg, #fff, #d2e2ff00);
}
i:nth-child(2) {
  left: 88%;
  width: 10px;
  height: 65%;
  opacity: 0.1;
}
i:nth-child(3) {
  left: 27%;
  width: 5px;
  height: 24%;
  opacity: 0.1;
}
</style>
