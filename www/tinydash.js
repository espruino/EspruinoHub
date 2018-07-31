/* Copyright (c) 2017, Gordon Williams, MPLv2 License. https://github.com/espruino/TinyDash */
/* All elements have x/y/width/height,name

  Elements that can be changed can also have `onchanged`

  TODO:
    terminal
    dial
    scrollbar
*/
var TD = {};
(function() {
  var LIGHTCOL = "#09F";
  function toElement(html) {
    var div = document.createElement('div');
    div.innerHTML = html;
    return div.childNodes[0];
  }
  function sendChanges(el, value) {
    if (el.opts.name) {
      var o = {};
      o[el.opts.name] = value;
      handleChange(o);
    }
    if (el.opts.onchange) {
      el.opts.onchange(el, value);
    }
  }
  function togglePressed(el) {
    el.pressed = 0|!+el.getAttribute("pressed");
    el.setAttribute("pressed", el.pressed);
    sendChanges(el, el.pressed);
    if (!el.toggle) {
      // non-toggleable elements always go back to not pressed
      el.pressed = 0;
      setTimeout(function() {
        el.setAttribute("pressed", 0);
      }, 200);
    }
  }
  function formatText(txt) {
    if ("number"!=typeof txt)
      return txt;
    if (Math.floor(txt)==txt) return txt; // ints
    if (Math.abs(txt)>1000) return txt.toFixed(0);
    if (Math.abs(txt)>100) return txt.toFixed(1);
    return txt.toFixed(2);
  }
  /// set up position/etc on the html element
  function setup(type, opts, el) {
    el.type = type;
    el.style="width:"+opts.width+"px;height:"+opts.height+"px;left:"+opts.x+"px;top:"+opts.y+"px;";
    el.opts = opts;
    return el;
  }
  function handleChange(data) {
    console.log("Change", data);
  }

  // --------------------------------------------------------------------------
  /* Update any named elements with the new data */
  TD.update = function(data) {
    var els = document.getElementsByClassName("td");
    for (var i=0;i<els.length;i++) {
      if (els[i].opts.name && els[i].setValue && els[i].opts.name in data)
        els[i].setValue(data[els[i].opts.name]);
    }
  }

  // --------------------------------------------------------------------------
  /* {label} */
  TD.label = function(opts) {
    return setup("label",opts,toElement('<div class="td td_label"><span>'+opts.label+'</span></div>'));
  };
  /* {label, glyph, value, toggle}*/
  TD.button = function(opts) {
    var pressed = opts.value?1:0;
    opts.glyph = opts.glyph || "&#x1f4a1;";
    var el = setup("button",opts,toElement('<div class="td td_btn" pressed="'+pressed+'"><span>'+opts.label+'</span><div class="td_btn_a">'+opts.glyph+'</div></div>'));
    el.getElementsByClassName("td_btn_a")[0].onclick = function() {
      togglePressed(el);
    };
    el.setValue = function(v) {
      el.pressed = v?1:0;
      el.setAttribute("pressed", el.pressed);
    };
    return el;
  };
  /* {label,value}*/
  TD.toggle = function(opts) {
    var pressed = opts.value?1:0;
    var el = setup("toggle",opts,toElement('<div class="td td_toggle" pressed="'+pressed+'"><span>'+opts.label+'</span><div class="td_toggle_a"><div class="td_toggle_b"/></div></div>'));
    el.toggle = true;
    el.getElementsByClassName("td_toggle_a")[0].onclick = function() {
      togglePressed(el);
    };
    el.setValue = function(v) {
      el.pressed = v?1:0;
      el.setAttribute("pressed", el.pressed);
    };
    return el;
  };
  /* {label,value,step,min,max}
    if step is specified, clickable up/down arrows are added */
  TD.value = function(opts) {
    var html;
    opts.value = parseFloat(opts.value);
    if (opts.step)
      html = '<div class="td_val_b">&#9664;</div><div class="td_val_a"></div><div class="td_val_b">&#9654;</div>';
    else html = '<div class="td_val_a"></div>';
    var el = setup("value",opts,toElement('<div class="td td_val"><span>'+opts.label+'</span>'+html+'</div>'));
    el.setValue = function(v) {
      if (opts.min && v<opts.min) v=opts.min;
      if (opts.max && v>opts.max) v=opts.max;
      if (opts.value != v) {
        sendChanges(el, el.pressed);
        opts.value = v;
      }
      el.getElementsByClassName("td_val_a")[0].innerHTML = formatText(v);
    };
    if (opts.step) {
      var b = el.getElementsByClassName("td_val_b");
      b[0].onclick = function(e) {
        el.setValue(opts.value-opts.step);
      };
      b[1].onclick = function(e) {
        el.setValue(opts.value+opts.step);
      };
    }
    el.setValue(opts.value);
    return el;
  };
  /* {label,value,min,max}*/
  TD.gauge = function(opts) {
    var v = (opts.value===undefined)?0:opts.value;
    var min = (opts.min===undefined)?0:opts.min;
    var max = (opts.max===undefined)?1:opts.max;
    var el = setup("gauge",opts,toElement('<div class="td td_gauge"><span>'+opts.label+'</span><canvas></canvas><div class="td_gauge_a">'+v+'</div></div>'));
    el.value = v;
    var c = el.getElementsByTagName("canvas")[0];
    var ctx = c.getContext("2d");
    function draw() {
      c.width = c.clientWidth;
      c.height = c.clientHeight;
      var s = Math.min(c.width,c.height);
      ctx.lineCap="round";
      ctx.clearRect(0,0,c.width,c.height);
      ctx.beginPath();
      ctx.lineWidth=20;
      ctx.strokeStyle = "#000";
      ctx.arc(c.width/2, c.height/2+20, (s/2)-24, Math.PI*0.75, 2.25 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.lineWidth=16;
      ctx.strokeStyle = LIGHTCOL;
      var v = (el.value-min) / (max-min);
      if (v<0) v=0;
      if (v>1) v=1;
      ctx.arc(c.width/2, c.height/2+20, (s/2)-24, Math.PI*0.75, (0.75+(1.5*v))*Math.PI);
      ctx.stroke();
    }
    setTimeout(draw,100);
    el.onresize = draw;
    el.setValue = function(v) {
      el.value = v;
      el.getElementsByClassName("td_gauge_a")[0].innerHTML = formatText(v);
      draw();
    };
    return el;
  };
  /* {label
      gridy - optional - grid value for y. Also enables labels on axis
      ylabel - optional - function(y_value) to format y axis labels, eg: function(y) { return y.toFixed(1); }
      gridx - optional - grid value for x. Also enables labels on axis
      xlabel - optional - function(x_value) to format x axis labels, eg: function(x) { return x.toFixed(1); }
    }
   */
  TD.graph = function(opts) {
    var el = setup("graph",opts,toElement('<div class="td td_graph"><span>'+opts.label+'</span><canvas></canvas></div>'));
    var c = el.getElementsByTagName("canvas")[0];
    var ctx = c.getContext("2d");
    el.setData = function(d) {
      el.opts.data = d;
      el.draw();
    };
    el.draw = function() {
      c.width = c.clientWidth;
      c.height = c.clientHeight;
      var s = Math.min(c.width,c.height);
      var xbase = 18;
      var ybase = c.height-18;
      var xs = (c.width-8-xbase);
      var ys = (ybase-28);
      ctx.font = "8px Sans";
      ctx.fillStyle = "#000";
      ctx.fillRect(4,24,c.width-8,c.height-28);
      var dxmin,dxmax,dymin,dymax;
      if (el.opts.data !== undefined) {
        var traces = ("object"==typeof el.opts.data[0]) ?
          el.opts.data : [el.opts.data];
        traces.forEach(function(trace) {
          for (var i in trace) {
            i = parseFloat(i);
            var v = parseFloat(trace[i]);
            if (dxmin===undefined || i<dxmin) dxmin=i;
            if (dxmax===undefined || i>dxmax) dxmax=i;
            if (dymin===undefined || v<dymin) dymin=v;
            if (dymax===undefined || v>dymax) dymax=v;
          }
        });
        if (el.opts.gridy) {
          var gy = el.opts.gridy;
          dymin = gy*Math.floor(dymin/gy);
          dymax = gy*Math.ceil(dymax/gy);
        }
        var dxs = dxmax+1-dxmin;
        var dys = dymax-dymin;
        if (dxs==0) dxs=1;
        if (dys==0) dys=1;
        function getx(x) { return xbase+(xs*(x-dxmin)/dxs); }
        function gety(y) { return ybase-(ys*(y-dymin)/dys); }
        traces.forEach(function(trace, idx) {
          ctx.beginPath();
          ctx.strokeStyle = (traces.length>1) ? "hsl("+(idx*360/traces.length)+", 100%, 50%)" : LIGHTCOL;
          for (var i in trace) {
            ctx.lineTo(getx(parseFloat(i)),
                       gety(parseFloat(trace[i])));
          }
          ctx.stroke();
        });
        ctx.fillStyle = "#fff";
        if (el.opts.gridy) {
          ctx.textAlign="right";
          for (var i=dymin;i<=dymax;i+=el.opts.gridy) {
            var y = gety(i);
            var t = el.opts.ylabel?el.opts.ylabel(i):i;
            ctx.fillRect(xbase-1, y, 3, 1);
            if (y>ctx.measureText(t).width/2) // does it fit?
              ctx.fillText(t, xbase-5, y+2);
          }
        }
        if (el.opts.gridx) {
          var gx = el.opts.gridx;
          ctx.textAlign="center";
          for (var i=gx*Math.ceil(dxmin/gx);i<=dxmax;i+=gx) {
            var x = getx(i);
            var t = el.opts.xlabel?el.opts.xlabel(i):i;
            ctx.fillRect(x,ybase-1, 1, 3);
            ctx.fillText(t, x, ybase+10);
          }
        }
      } else {
        ctx.fillStyle = "#888";
        ctx.textAlign = "center";
        ctx.fillText("[No Data]", xbase+(xs/2), ybase-(ys/2));
      }
      // axes
      ctx.beginPath();
      ctx.strokeStyle = "#fff";
      ctx.moveTo(xbase,ybase-ys);
      ctx.lineTo(xbase,ybase+10);
      ctx.moveTo(xbase-10,ybase);
      ctx.lineTo(xbase+xs,ybase);
      ctx.stroke();
    }
    setTimeout(el.draw,100);
    el.onresize = el.draw;
    return el;
  };
  /* {label,text}
    text = newline separated linex
  */
  TD.log = function(opts) {
    if (!opts.text) opts.text="";
    var el = setup("log",opts,toElement('<div class="td td_log"><span>'+opts.label+'</span><div class="td_log_a td_scrollable"></div></div>'));
    el.update = function() {
      el.getElementsByClassName("td_log_a")[0].innerHTML = opts.text.replace(/\n/g,"<br/>\n");
    };
    el.log = function(txt) {
      opts.text += "\n"+txt;
      el.update();
      var e = el.getElementsByClassName("td_log_a")[0];
      e.scrollTop = e.scrollHeight;
    };
    el.clear = function() {
      opts.text = "";
      el.update();
    };
    return el;
  };
  /* {label}*/
  TD.modal = function(opts) {
    var el = setup("modal",opts,toElement('<div class="td td_modal"><span>'+opts.label+'</span></div>'));
    el.onclick = function() {
      togglePressed(el);
      if (!el.opts.onchange)
        el.remove();
    };
    el.remove = function() {
      if (el.parentNode)
        el.parentNode.removeChild(el);
    };
    return el;
  };

})();
