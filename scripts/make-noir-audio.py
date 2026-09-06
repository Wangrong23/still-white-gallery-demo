"""Original layered effects and a short hall impulse, generated without downloads."""
import math, pathlib, random, struct, wave

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'client' / 'assets'
OUT.mkdir(exist_ok=True)
RATE = 22050

def write(name, channels):
    peak = max(abs(v) for channel in channels for v in channel) or 1
    with wave.open(str(OUT / (name + '.wav')), 'wb') as f:
        f.setparams((len(channels), 2, RATE, 0, 'NONE', 'not compressed'))
        f.writeframes(b''.join(struct.pack('<h', int(max(-1,min(1,v/peak)) * 26000))
            for frame in zip(*channels) for v in frame))

def effect(name, duration, seed, kind):
    rng = random.Random(seed)
    grains = [(rng.uniform(.05,.85), rng.uniform(500,2300), rng.uniform(.018,.05)) for _ in range(19)]
    data, low = [], 0
    for i in range(int(duration * RATE)):
        t = i / RATE
        n = rng.uniform(-1,1)
        low += .22 * (n-low)
        if kind == 'heel':
            sole = max(0,t-.043)
            v = .6*(n-low)*math.exp(-t*170) + .4*math.sin(t*2*math.pi*(140+seed%25))*math.exp(-t*50)
            if t >= .043: v += .48*low*math.exp(-sole*45) + .17*math.sin(sole*2*math.pi*230)*math.exp(-sole*70)
        elif kind == 'revolver':
            v = .2*(n-low)*math.exp(-t*400)
            if t >= .012:
                u=t-.012
                v += .85*n*math.exp(-u*65) + .65*math.sin(2*math.pi*(95*u-30*u*u))*math.exp(-u*24)
                v += .1*low*math.exp(-u*9)
        elif kind == 'plaster':
            v = .5*low*math.exp(-t*42) + .16*math.sin(t*2*math.pi*180)*math.exp(-t*35)
            for start, freq, decay in grains:
                u=t-start
                if 0 <= u < decay*5:
                    v += (1-start)**1.5 * math.exp(-u/decay) * (.24*(n-low)+.045*math.sin(2*math.pi*freq*u))
        else:
            v = min(1,t*150)*math.exp(-t*2.3)*(math.sin(2*math.pi*370*t)+.36*math.sin(2*math.pi*973*t)+.17*math.sin(2*math.pi*1531*t))
        # A short release at the end prevents a discontinuity in the PCM file.
        data.append(v * min(1,(duration-t)/.02))
    write(name,[data])

for i in range(3): effect('heel' if i==0 else f'heel-{i+1}', .3, 1930+i, 'heel')
effect('revolver', .6, 1940, 'revolver')
for i in range(2): effect('plaster' if i==0 else 'plaster-2', 1.05, 1950+i, 'plaster')
effect('bell', 2.5, 1960, 'bell')

channels=[]
for channel in range(2):
    rng=random.Random(1970+channel)
    data=[0.0]*int(RATE*.95)
    for delay, gain in [(.043,.6),(.078,.4),(.119,.29),(.173,.20),(.231,.13)]:
        data[int(RATE*(delay+channel*.006))]=gain
    low=0
    for i in range(int(.035*RATE),len(data)):
        t=i/RATE
        low += .12*(rng.uniform(-1,1)-low)
        data[i] += low*.045*math.exp(-t*7)*min(1,(.95-t)/.03)
    channels.append(data)
write('hall-ir',channels)
print('Generated layered footsteps, revolver, plaster, bell and short stereo hall impulse.')
