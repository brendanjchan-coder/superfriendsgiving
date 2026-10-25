#!/usr/bin/env python3
"""Generate an event's page + Apps Script backend from the master templates.
Usage: python3 new_event.py events/<slug>/config.json   (writes index.html and Code.gs next to it)"""
import json, sys, os, html, re

def build(cfg_path):
    cfg = json.load(open(cfg_path))
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.dirname(os.path.abspath(cfg_path))
    name = cfg['name']
    label = cfg.get('guest_label', 'family')            # 'family' or 'name'
    kids = cfg.get('kids', True)
    emoji = cfg.get('emoji', '🎉')
    eyebrow = cfg.get('eyebrow', 'BBQ · Pot luck')
    invite = cfg.get('invite') or f"Join us for {cfg.get('tagline', 'a pot luck')}. Let us know if you're coming and what you'll bring."
    name_html = cfg.get('name_html') or html.escape(name)
    admins = cfg.get('admins') or []
    if not admins: sys.exit('config needs at least one admin email')
    event = {'date': cfg['date'], 'time': cfg['time'], 'where': cfg['where']}
    js = lambda v: json.dumps(v, ensure_ascii=False)

    # ---- page ----
    p = open(os.path.join(here, 'templates/index.template.html')).read()
    extra_css = '' if kids else '  div:has(> label + .stepper[data-for="kids"]), #kidAgesWrap { display: none !important; }'
    p = (p.replace('__NAME_HTML__', name_html).replace('__NAME__', html.escape(name))
           .replace('__EMOJI__', emoji).replace('__EYEBROW__', html.escape(eyebrow))
           .replace('__API_URL__', cfg.get('api_url', '')).replace('__INVITE__', html.escape(invite, quote=False))
           .replace('__EXTRA_CSS__', extra_css))
    if label == 'name':
        for a, b in [('Your family', 'Your name'), ('Choose your family…', 'Choose your name…'),
                     ('Please choose your family from the list.', 'Please choose your name from the list.'),
                     ('Please choose your family', 'Please choose your name'),
                     ('Choose your family, add your email', 'Choose your name, add your email'),
                     ('Everything each family entered.', 'Everything each guest entered.'),
                     (' have already RSVP’d.', ' has already RSVP’d.'),
                     ('<th>Family</th>', '<th>Name</th>'), ('families replied', 'replied')]:
            p = p.replace(a, b)
        p = p.replace("[yes.length, 'households']", "[yes.length, 'coming']")
    open(os.path.join(out, 'index.html'), 'w').write(p)

    # ---- backend ----
    c = open(os.path.join(here, 'templates/Code.template.gs')).read()
    c = (c.replace('__NAME__', name).replace('__SHEET_ID__', cfg.get('sheet_id', 'PASTE_SHEET_ID'))
           .replace('__ADMINS__', js(admins)).replace('__EVENT__', js(event))
           .replace('__GUESTS__', '[\n  ' + ',\n  '.join(js(g) for g in cfg['guests']) + '\n]'))
    if label == 'name':
        c = c.replace('choose your family from the list', 'choose your name from the list')
        c = c.replace("household + ' have already RSVP", "household + ' has already RSVP")
    open(os.path.join(out, 'Code.gs'), 'w').write(c)
    print('wrote', out + '/index.html and Code.gs;', len(cfg['guests']), 'guests')

if __name__ == '__main__':
    build(sys.argv[1])
