using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// Enumerate Shell's Open With applications without changing file associations.
public static class ApplicationChooser {
  [ComImport, Guid("973810AE-9599-4B88-9E4D-6EE98C9552DA"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IEnumAssocHandlers {
    [PreserveSig] int Next(uint count, out IAssocHandler handler, out uint fetched);
  }
  [ComImport, Guid("F04061AC-1659-4A3F-A954-775AA57FC083"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAssocHandler {
    void GetName([MarshalAs(UnmanagedType.LPWStr)] out string name);
    void GetUIName([MarshalAs(UnmanagedType.LPWStr)] out string name);
  }
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  static extern void SHAssocEnumHandlers(string extension, uint filter, out IEnumAssocHandlers handlers);
  sealed class Owner : IWin32Window {
    public IntPtr Handle { get; private set; }
    public Owner(long value) { Handle = new IntPtr(value); }
  }
  public sealed class Entry {
    public string program { get; set; }
    public string name { get; set; }
    public override string ToString() { return name + " — " + program; }
  }
  public static List<Entry> Applications(string extension) {
    var result = new List<Entry>();
    var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    IEnumAssocHandlers handlers;
    SHAssocEnumHandlers(extension, 0, out handlers);
    try {
      IAssocHandler handler; uint fetched;
      while (handlers.Next(1, out handler, out fetched) == 0 && fetched == 1) {
        try {
          string program, name;
          handler.GetName(out program); handler.GetUIName(out name);
          if (!String.IsNullOrEmpty(program) && Path.IsPathRooted(program) &&
              String.Equals(Path.GetExtension(program), ".exe", StringComparison.OrdinalIgnoreCase) &&
              File.Exists(program) && seen.Add(program)) {
            result.Add(new Entry { program = program, name = String.IsNullOrEmpty(name) ? Path.GetFileNameWithoutExtension(program) : name });
          }
        } catch (COMException) { /* Skip unavailable Shell handlers. */ }
        finally { Marshal.ReleaseComObject(handler); }
      }
    } finally { Marshal.ReleaseComObject(handlers); }
    result.Sort((a, b) => StringComparer.CurrentCultureIgnoreCase.Compare(a.name, b.name));
    return result;
  }
  static string Choose(string extension, IWin32Window owner) {
    Application.EnableVisualStyles();
    using (var form = new Form()) {
      form.Text = "选择打开 " + extension + " 的应用";
      form.ClientSize = new Size(660, 380); form.MinimumSize = new Size(440, 280);
      form.StartPosition = FormStartPosition.CenterParent; form.ShowInTaskbar = false;
      form.Font = SystemFonts.MessageBoxFont;
      var layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(16), ColumnCount = 1, RowCount = 3 };
      layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
      layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
      layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
      var hint = new Label { Text = "选择系统已注册的应用，或浏览其他程序。不会修改系统默认打开方式。", AutoSize = true, Margin = new Padding(0, 0, 0, 12) };
      var list = new ListBox { Dock = DockStyle.Fill, HorizontalScrollbar = true, IntegralHeight = false };
      foreach (var entry in Applications(extension)) list.Items.Add(entry);
      var buttons = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(0, 12, 0, 0) };
      var cancel = new Button { Text = "取消", AutoSize = true, DialogResult = DialogResult.Cancel };
      var accept = new Button { Text = "选择", AutoSize = true, Enabled = false };
      var browse = new Button { Text = "浏览其他程序…", AutoSize = true };
      string chosen = null;
      accept.Click += (sender, args) => { chosen = ((Entry)list.SelectedItem).program; form.DialogResult = DialogResult.OK; };
      list.SelectedIndexChanged += (sender, args) => { accept.Enabled = list.SelectedItem != null; };
      list.DoubleClick += (sender, args) => { if (accept.Enabled) accept.PerformClick(); };
      browse.Click += (sender, args) => {
        using (var file = new OpenFileDialog { Title = "选择编辑器", Filter = "应用程序 (*.exe)|*.exe", CheckFileExists = true }) {
          if (file.ShowDialog(form) == DialogResult.OK) { chosen = file.FileName; form.DialogResult = DialogResult.OK; }
        }
      };
      buttons.Controls.Add(cancel); buttons.Controls.Add(accept); buttons.Controls.Add(browse);
      layout.Controls.Add(hint, 0, 0); layout.Controls.Add(list, 0, 1); layout.Controls.Add(buttons, 0, 2);
      form.Controls.Add(layout); form.AcceptButton = accept; form.CancelButton = cancel;
      return form.ShowDialog(owner) == DialogResult.OK ? chosen : null;
    }
  }
  [STAThread]
  public static int Main(string[] args) {
    Console.OutputEncoding = new UTF8Encoding(false);
    try {
      if (args.Length < 2 || (args[1] != ".md" && args[1] != ".html")) throw new ArgumentException("无效的文件类型。");
      var json = new JavaScriptSerializer();
      if (args[0] == "list") Console.WriteLine(json.Serialize(Applications(args[1])));
      else if (args[0] == "choose" && args.Length == 3) {
        var program = Choose(args[1], new Owner(Int64.Parse(args[2])));
        Console.WriteLine(json.Serialize(new { canceled = program == null, program = program }));
      } else throw new ArgumentException("无效的应用选择请求。");
      return 0;
    } catch (Exception error) { Console.Error.WriteLine(error.Message); return 1; }
  }
}
