// One startup request. The geometry and reveal sequence follows fsearch_drawer.
(function () {
    const request = __REQUEST__;
    const DEFAULT_SIZE = request.defaults;
    const MIN_SIZE = request.minimum;
    const geometry = __GEOMETRY__;
    let done = false, target = null, wanted = null;
    const output = workspace.screenAt(workspace.cursorPos);
    const timers = [];
    function report(event, value) {
        value.event = event;
        callDBus(request.service, '/Layout', 'io.github.yceachan.Emd.Layout', 'Report', JSON.stringify(value));
    }
    function finish(error) {
        if (done) return;
        done = true;
        workspace.windowAdded.disconnect(added);
        if (target) {
            target.frameGeometryChanged.disconnect(acknowledged);
            if (!target.deleted) target.opacity = 1;
        }
        report(error ? 'error' : 'applied', error ? {message: error} : {geometry: wanted, output: output.name});
    }
    function acknowledged() {
        if (done || !target || !wanted) return;
        if (workspace.screens.indexOf(output) === -1) { finish('鼠标目标屏幕已移除。'); return; }
        if (target.output === output && ['x', 'y', 'width', 'height'].every(key => Math.abs(target.frameGeometry[key] - wanted[key]) <= 1)) finish();
    }
    function added(window) {
        if (done || target || window.pid !== request.pid || !window.normalWindow || window.dialog || window.transient) return;
        target = window;
        if (workspace.screens.indexOf(output) === -1) { finish('鼠标目标屏幕已移除。'); return; }
        target.opacity = 0;
        target.frameGeometryChanged.connect(acknowledged);
        target.desktops = [workspace.currentDesktopForScreen(output)];
        workspace.sendClientToScreen(target, output);
        target.frameGeometry = wanted;
        acknowledged();
    }
    function later(ms, callback) {
        const timer = new QTimer(); timer.singleShot = true; timer.interval = ms; timer.timeout.connect(callback); timers.push(timer); timer.start();
    }
    workspace.windowAdded.connect(added);
    try {
        if (!output) throw new Error('无法取得鼠标所在屏幕。');
        const area = workspace.clientArea(KWin.MaximizeArea, output, workspace.currentDesktopForScreen(output));
        wanted = geometry(request.layout, request.count, area);
        report('context', {geometry: wanted, displayWidth: area.width});
    } catch (error) { finish(error.message); }
    later(10000, function () {
        if (!done) finish('KWin 未确认启动窗口几何。');
        callDBus('org.kde.KWin', '/Scripting', 'org.kde.kwin.Scripting', 'unloadScript', request.plugin);
    });
})();
