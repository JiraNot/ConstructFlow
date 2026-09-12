# frozen_string_literal: true
# Run: ruby scripts/generate_icons.rb
# Generates 24x24 + 48x48 PNG icons for every ConstructFlow toolbar button.

require 'zlib'
require 'fileutils'

OUT = File.join(__dir__, '..', 'apps', 'sketchup-extension', 'constructflow', 'icons')
FileUtils.mkdir_p(OUT)

# ── PNG encoder ────────────────────────────────────────────────────────────────
def chunk(type, data)
  [data.bytesize].pack('N') + type + data + [Zlib.crc32(type + data)].pack('N')
end

def encode_png(pixels)
  h = pixels.size; w = pixels[0].size
  raw = pixels.flat_map { |row| [0] + row.flatten }.pack('C*')
  "\x89PNG\r\n\x1a\n".b +
    chunk('IHDR', [w, h, 8, 6, 0, 0, 0].pack('NNC5')) +
    chunk('IDAT', Zlib::Deflate.deflate(raw, 9)) +
    chunk('IEND', '')
end

def scale(pixels, f)
  pixels.flat_map { |row| Array.new(f) { row.flat_map { |px| Array.new(f) { px } } } }
end

# ── Canvas ─────────────────────────────────────────────────────────────────────
class Canvas
  S = 24; T = [0,0,0,0]
  def initialize; @p = Array.new(S){Array.new(S){T.dup}}; end
  def px; @p; end

  def rect(x,y,w,h,c)
    (y...[y+h,S].min).each{|py| next if py<0; (x...[x+w,S].min).each{|px| next if px<0; @p[py][px]=c}}; self
  end
  def circle(cx,cy,r,c)
    (0...S).each{|py|(0...S).each{|px| @p[py][px]=c if (px-cx)**2+(py-cy)**2<=r*r}}; self
  end
  def ring(cx,cy,ro,ri,c)
    (0...S).each{|py|(0...S).each{|px| d2=(px-cx)**2+(py-cy)**2; @p[py][px]=c if d2<=ro*ro&&d2>ri*ri}}; self
  end
  def triangle(pts,c)
    ys=pts.map{|_,y|y}
    (ys.min..ys.max).each do |py|
      xs=[]
      pts.each_with_index do|(ax,ay),i|
        bx,by=pts[(i+1)%pts.size]
        next if (ay<py&&by<py)||(ay>py&&by>py)
        ay==by ? xs+=[ax,bx] : xs<<(ax+(py-ay).to_f/(by-ay)*(bx-ax)).round
      end
      next if xs.size<2; xs.sort!
      (xs.first..xs.last).each{|px| @p[py][px]=c if px.between?(0,S-1)}
    end; self
  end
  def hline(y,x1,x2,c,t=2)
    (-(t/2)...(t-t/2)).each{|dy| py=y+dy; next unless py.between?(0,S-1); (x1..x2).each{|px| @p[py][px]=c if px.between?(0,S-1)}}; self
  end
  def vline(x,y1,y2,c,t=2)
    (-(t/2)...(t-t/2)).each{|dx| px=x+dx; next unless px.between?(0,S-1); (y1..y2).each{|py| @p[py][px]=c if py.between?(0,S-1)}}; self
  end
end

# ── Colours ────────────────────────────────────────────────────────────────────
CORE_B=[59,130,246,255]; CORE_D=[29,78,216,255]
ARCH_B=[107,114,128,255]; ARCH_D=[55,65,81,255]
OPE_B=[124,58,237,255]
STR_B=[55,65,81,255]; STR_D=[17,24,39,255]
ROOF_B=[245,158,11,255]; ROOF_D=[180,110,5,255]
SURF_B=[16,185,129,255]; SURF_D=[5,128,90,255]
DRN_B=[6,182,212,255]; DRN_D=[8,130,150,255]
ELEC_B=[239,68,68,255]; ELEC_D=[185,28,28,255]
INT_B=[236,72,153,255]; INT_D=[157,23,77,255]
LIB_B=[249,115,22,255]; LIB_D=[194,65,12,255]
CST_B=[20,184,166,255]; CST_D=[13,148,136,255]
W=[255,255,255,255]

# ── Icon definitions ───────────────────────────────────────────────────────────
ICONS = {
  'inspector' => -> {
    c=Canvas.new
    c.ring(12,12,11,8,CORE_B).rect(11,9,2,2,W).rect(11,12,2,6,W)
  },
  'level' => -> {
    c=Canvas.new
    c.rect(2,4,18,4,CORE_B).rect(2,10,18,4,CORE_D).rect(2,16,18,4,CORE_B)
    c.vline(20,3,21,CORE_D,2).triangle([[20,2],[24,12],[20,22]],CORE_D)
  },
  'phase' => -> {
    c=Canvas.new
    c.rect(3,5,18,16,CORE_B).rect(3,5,18,5,CORE_D)
    c.rect(7,3,2,5,W).rect(15,3,2,5,W)
    [[6,12],[11,12],[16,12],[6,16],[11,16],[16,16]].each{|x,y|c.rect(x,y,3,2,W)}
    c
  },
  'wall' => -> {
    c=Canvas.new
    c.rect(1,6,22,12,ARCH_B).rect(1,6,22,2,ARCH_D).rect(1,16,22,2,ARCH_D)
  },
  'opening' => -> {
    c=Canvas.new
    c.rect(1,6,7,12,ARCH_B).rect(16,6,7,12,ARCH_B)
    c.rect(1,6,7,2,ARCH_D).rect(1,16,7,2,ARCH_D)
    c.rect(16,6,7,2,ARCH_D).rect(16,16,7,2,ARCH_D)
    c.hline(19,8,16,OPE_B,2)
  },
  'door_window' => -> {
    c=Canvas.new
    c.rect(4,4,2,16,OPE_B).rect(4,4,14,2,OPE_B).rect(16,4,2,16,OPE_B).rect(4,18,14,2,OPE_B)
    c.rect(6,6,10,12,[200,180,255,200]).circle(6,18,10,[200,180,255,80])
  },
  'column' => -> {
    c=Canvas.new
    c.rect(6,6,13,13,STR_D).rect(5,5,13,13,STR_B).rect(5,5,13,2,[100,110,120,255])
  },
  'foundation' => -> {
    c=Canvas.new
    c.triangle([[7,5],[17,5],[22,19],[2,19]],STR_B).rect(2,19,20,3,STR_D)
    c.hline(5,7,17,[100,110,120,255],1)
  },
  'roof' => -> {
    c=Canvas.new
    c.triangle([[12,2],[23,19],[1,19]],ROOF_B).triangle([[12,5],[20,18],[4,18]],[250,200,80,255])
    c.rect(1,19,22,3,ROOF_D)
  },
  'gutter' => -> {
    c=Canvas.new
    c.rect(1,7,22,3,ROOF_B).rect(1,7,3,14,ROOF_B).rect(20,7,3,14,ROOF_B).rect(1,18,22,3,ROOF_D)
    c.rect(4,13,16,5,[100,180,255,180])
  },
  'surface' => -> {
    c=Canvas.new
    c.rect(2,2,20,20,[210,240,220,255])
    [2,7,12,17,22].each{|x|c.vline(x,2,21,SURF_D,1)}
    [2,7,12,17,22].each{|y|c.hline(y,2,21,SURF_D,1)}
    c.rect(8,8,4,4,SURF_B)
  },
  'manhole' => -> {
    c=Canvas.new
    c.circle(12,12,10,DRN_D).circle(12,12,9,DRN_B).circle(12,12,6,DRN_D)
    c.circle(12,12,5,[180,230,240,255])
    c.hline(12,3,21,DRN_D,1).vline(12,3,21,DRN_D,1)
  },
  'pipe' => -> {
    c=Canvas.new
    c.rect(2,9,20,8,DRN_D).rect(2,8,20,8,DRN_B).rect(2,8,20,2,[150,230,245,255])
    c.circle(2,12,5,DRN_D).circle(22,12,5,DRN_D)
  },
  'cable' => -> {
    c=Canvas.new
    c.rect(11,2,5,10,ELEC_B).rect(6,10,11,2,ELEC_B).rect(8,12,5,10,ELEC_B)
    c.rect(11,2,2,8,[255,160,160,255])
  },
  'panelboard' => -> {
    c=Canvas.new
    c.rect(4,3,17,19,ELEC_D).rect(3,2,16,19,ELEC_B).rect(3,2,16,4,ELEC_D)
    [7,11,15].each{|y|c.rect(5,y,8,2,W).rect(14,y,3,2,ELEC_D)}
    c
  },
  'cabinet' => -> {
    c=Canvas.new
    c.rect(2,5,20,14,INT_D).rect(2,4,20,14,INT_B).rect(2,4,20,2,[250,180,220,255])
    c.vline(12,4,18,INT_D,1)
    c.rect(7,10,3,2,W).rect(14,10,3,2,W)
    c.rect(2,18,20,3,INT_D)
  },
  'wardrobe' => -> {
    c=Canvas.new
    c.rect(3,2,18,20,INT_D).rect(4,2,16,20,INT_B)
    c.hline(7,4,19,INT_D,1).vline(12,2,21,INT_D,1)
    c.rect(5,8,5,9,[250,180,220,200]).rect(13,8,5,9,[250,180,220,200])
    c.rect(8,13,2,4,W).rect(14,13,2,4,W)
  },
  'asset' => -> {
    c=Canvas.new
    c.triangle([[12,2],[22,8],[12,13]],LIB_B)
    c.triangle([[12,2],[2,8],[12,13]],[220,140,60,255])
    c.triangle([[2,8],[12,13],[12,22],[2,17]],LIB_D)
    c.triangle([[22,8],[12,13],[12,22],[22,17]],[200,120,40,255])
    c.vline(12,2,22,LIB_D,1)
  },
  'costing' => -> {
    c=Canvas.new
    c.rect(5,3,15,19,CST_D).rect(4,2,15,19,CST_B).rect(4,2,15,4,CST_D)
    [7,10,13,16].each{|y|c.rect(6,y,10,1,W)}
    c.rect(8,18,2,3,W).rect(8,18,5,1,W).rect(8,20,4,1,W).rect(8,21,5,1,W)
  },
}.freeze

# ── Generate all ───────────────────────────────────────────────────────────────
ICONS.each do |name, builder|
  canvas = builder.call
  pixels = canvas.px
  File.binwrite(File.join(OUT, "#{name}.png"),    encode_png(pixels))
  File.binwrite(File.join(OUT, "#{name}@2x.png"), encode_png(scale(pixels, 2)))
  puts "  ✓ #{name}"
end
puts "\n#{ICONS.size * 2} files → #{OUT}"
