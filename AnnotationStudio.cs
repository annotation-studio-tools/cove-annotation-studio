using Cove.Sdk;
using Cove.Plugins;
public sealed class AnnotationStudioExtension : CoveExtensionBase
{
 public override UIManifest GetUIManifest() => ManifestBuilder()
  .AddPage("annotation-studio", "Annotation Studio", "AnnotationPage", showInNav: false)
  .AddSlot("video-detail-actions", "AnnotateAction")
  .Build();
}
